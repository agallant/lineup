import { blocks, clap, kick, mixAt, roomNoise, addInto, silence, tap } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import type { AnalyzerMessage } from '../types';
import { InputAnalyzer } from './analyzer';
import { PercussionAnalyzer } from './percussion-analyzer';

const SR = 48000;

function run(sig: Float32Array, start = 0): { messages: AnalyzerMessage[]; emittedAt: number[] } {
  const a = new PercussionAnalyzer(SR);
  const messages: AnalyzerMessage[] = [];
  const emittedAt: number[] = [];
  for (const [b, s] of blocks(sig)) {
    for (const m of a.process(b, start + s)) {
      messages.push(m);
      if (m.type === 'input') emittedAt.push((start + s + b.length) / SR);
    }
  }
  return { messages, emittedAt };
}
const events = (m: AnalyzerMessage[]) => m.flatMap((x) => (x.type === 'input' ? [x.event] : []));

describe('PercussionAnalyzer', () => {
  it('emits an onset event with timbre features, stamped with the ONSET time, after the analysis window has arrived', () => {
    const sig = silence(1, SR);
    mixAt(sig, clap(SR, { seed: 1 }), 0.4, SR);
    const { messages, emittedAt } = run(sig);
    const ev = events(messages);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.kind).toBe('onset');
    expect(Math.abs(ev[0]!.time - 0.4)).toBeLessThan(0.002);
    expect(ev[0]!.velocity).toBeGreaterThan(0.3);
    expect(Object.keys(ev[0]!.features!).sort()).toEqual(
      ['centroid', 'decayMs', 'flatness', 'high', 'low', 'mid', 'peakDb', 'rmsDb', 'zcr'].sort(),
    );
    // held back until ~2048 samples (43 ms) after the onset, then released within a block or two
    const delay = emittedAt[0]! - ev[0]!.time;
    expect(delay).toBeGreaterThan(0.04);
    expect(delay).toBeLessThan(0.05);
  });

  it('reports a different timbre for a kick and a clap', () => {
    const sig = silence(1.4, SR);
    mixAt(sig, kick(SR, { seed: 1 }), 0.3, SR);
    mixAt(sig, clap(SR, { seed: 1 }), 0.9, SR);
    const [k, c] = events(run(sig).messages);
    expect(k!.features!['centroid']!).toBeLessThan(c!.features!['centroid']! / 3);
    expect(k!.features!['low']!).toBeGreaterThan(c!.features!['low']!);
  });

  it('emits regular level frames for meters, with no pitch', () => {
    const sig = silence(1, SR);
    mixAt(sig, clap(SR, { seed: 1, amplitude: 0.8 }), 0.4, SR);
    const frames = run(sig).messages.flatMap((m) => (m.type === 'frame' ? [m.frame] : []));
    expect(frames.length).toBeGreaterThan(80);
    expect(frames.every((f) => f.pitchHz === null)).toBe(true);
    const loud = Math.max(...frames.map((f) => f.peakDb));
    expect(loud).toBeGreaterThan(-10);
    expect(Math.min(...frames.map((f) => f.rmsDb))).toBeLessThan(-100);
  });

  it('gives every hit in a fast sequence its own event, in order, even when analysis windows overlap', () => {
    const sig = silence(1.5, SR);
    const times = [0.3, 0.4, 0.5, 0.6, 0.7];
    times.forEach((t, i) =>
      mixAt(sig, i % 2 ? tap(SR, { seed: i }) : clap(SR, { seed: i }), t, SR),
    );
    const ev = events(run(sig).messages);
    expect(ev).toHaveLength(5);
    ev.forEach((e, i) => expect(Math.abs(e.time - times[i]!)).toBeLessThan(0.003));
    expect(ev.every((e) => e.features !== undefined)).toBe(true);
  });

  it('is independent of the absolute stream position and the block size', () => {
    const sig = silence(1, SR);
    mixAt(sig, clap(SR, { seed: 5 }), 0.5, SR);
    const base = events(run(sig, 0).messages);
    const shifted = events(run(sig, 7_654_321).messages);
    expect(shifted).toHaveLength(1);
    expect(shifted[0]!.time - 7_654_321 / SR).toBeCloseTo(base[0]!.time, 9);
    for (const [k, v] of Object.entries(base[0]!.features!))
      expect(shifted[0]!.features![k]).toBeCloseTo(v, 6);
    const a = new PercussionAnalyzer(SR);
    const odd: AnalyzerMessage[] = [];
    for (const [b, s] of blocks(sig, 313)) odd.push(...a.process(b, s));
    expect(events(odd)[0]!.features!['centroid']).toBeCloseTo(base[0]!.features!['centroid']!, 6);
  });

  it('features do not depend on loudness (a quiet clap looks like a loud clap)', () => {
    const loudSig = silence(1, SR);
    const quietSig = silence(1, SR);
    mixAt(loudSig, clap(SR, { seed: 2, amplitude: 0.8, variation: 0 }), 0.5, SR);
    mixAt(quietSig, clap(SR, { seed: 2, amplitude: 0.08, variation: 0 }), 0.5, SR);
    const a = events(run(loudSig).messages)[0]!.features!;
    const b = events(run(quietSig).messages)[0]!.features!;
    for (const k of ['centroid', 'low', 'mid', 'high', 'zcr']) expect(b[k]).toBeCloseTo(a[k]!, 2);
    expect(a['peakDb']! - b['peakDb']!).toBeGreaterThan(15);
  });

  it('classifies cleanly in room noise too: features of a clap barely move', () => {
    const quiet = silence(1, SR);
    mixAt(quiet, clap(SR, { seed: 2, variation: 0 }), 0.5, SR);
    const noisy = Float32Array.from(quiet);
    addInto(noisy, roomNoise(1, SR, { rmsDb: -55, seed: 3 }));
    const a = events(run(quiet).messages)[0]!.features!;
    const b = events(run(noisy).messages)[0]!.features!;
    expect(Math.abs(Math.log2(b['centroid']! / a['centroid']!))).toBeLessThan(0.25);
    expect(Math.abs(b['mid']! - a['mid']!)).toBeLessThan(0.1);
  });
});

describe('InputAnalyzer in percussion mode', () => {
  it('delegates to the percussion analyzer and runs no pitch tracking', () => {
    const a = new InputAnalyzer(SR, { percussion: {} });
    const sig = silence(1, SR);
    mixAt(sig, clap(SR, { seed: 1 }), 0.4, SR);
    const out: AnalyzerMessage[] = [];
    for (const [b, s] of blocks(sig)) out.push(...a.process(b, s));
    expect(events(out)).toHaveLength(1);
    expect(events(out)[0]!.features).toBeDefined();
    expect(
      out
        .filter((m) => m.type === 'frame')
        .every((m) => m.type === 'frame' && m.frame.pitchHz === null),
    ).toBe(true);
  });
});
