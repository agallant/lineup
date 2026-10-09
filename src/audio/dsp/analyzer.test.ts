import { describe, expect, it } from 'vitest';
import { blocks, karplusStrong, mixAt, silence } from '../../test-utils/synth';
import { midiToFrequency, noteFromFrequency } from '../notes';
import type { AnalysisFrame, AnalyzerMessage, InputEvent } from '../types';
import { InputAnalyzer } from './analyzer';

describe('InputAnalyzer', () => {
  it('turns a plucked C4 into an onset event and pitched analysis frames', () => {
    const sr = 48000;
    const signal = silence(1.5, sr);
    mixAt(signal, karplusStrong(midiToFrequency(60), 1, sr), 0.5, sr);

    const analyzer = new InputAnalyzer(sr);
    // Pretend the worklet started 10 s into the AudioContext's life.
    const offset = 10 * sr;
    const messages: AnalyzerMessage[] = [];
    for (const [block, start] of blocks(signal))
      messages.push(...analyzer.process(block, offset + start));

    const events: InputEvent[] = messages.flatMap((m) => (m.type === 'input' ? [m.event] : []));
    const frames: AnalysisFrame[] = messages.flatMap((m) => (m.type === 'frame' ? [m.frame] : []));

    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('onset');
    expect(Math.abs(events[0]!.time - 10.5)).toBeLessThan(0.004);

    const before = frames.filter((f) => f.time < 10.45);
    const during = frames.filter((f) => f.time > 10.55 && f.time < 11.2);
    expect(before.every((f) => f.pitchHz === null && f.rmsDb < -100)).toBe(true);
    expect(during.length).toBeGreaterThan(50);
    expect(
      during.every((f) => f.pitchHz !== null && noteFromFrequency(f.pitchHz).label === 'C4'),
    ).toBe(true);
    expect(during.every((f) => f.peakDb > f.rmsDb && f.peakDb <= 0)).toBe(true);
  });
});
