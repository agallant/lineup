import { centsBetween, midiToFrequency, type InputEvent } from '@lineup/core';
import { blocks, mixAt, silence, ukeNote } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { InputAnalyzer } from './dsp/analyzer';
import { OnsetPitchAttacher } from './onset-pitch';
import type { AnalyzerMessage } from './types';

const SR = 48000;

function run(signal: Float32Array, attacher = new OnsetPitchAttacher()) {
  const analyzer = new InputAnalyzer(SR);
  const out: InputEvent[] = [];
  const raw: InputEvent[] = [];
  for (const [b, s] of blocks(signal)) {
    for (const m of analyzer.process(b, s)) {
      if (m.type === 'input') raw.push(m.event);
      out.push(...attacher.push(m));
    }
  }
  out.push(...attacher.flush());
  return { out, raw };
}

describe('OnsetPitchAttacher', () => {
  it('attaches the right pitch (within 10 cents) to plucks across the neck, keeping onset time', () => {
    // Notes are damped before the next one (normal melody technique); see the
    // known-limitation test below for what happens when they ring over each other.
    const midis = [60, 64, 67, 69, 72, 76, 81];
    const sig = silence(0.4 + midis.length * 0.6, SR);
    midis.forEach((m, i) =>
      mixAt(sig, ukeNote(m, SR, { seed: i + 1, duration: 0.45 }), 0.4 + i * 0.6, SR),
    );
    const { out, raw } = run(sig);
    expect(out).toHaveLength(midis.length);
    out.forEach((e, i) => {
      expect(e.time).toBe(raw[i]!.time); // untouched
      expect(e.pitch).toBeDefined();
      expect(Math.abs(centsBetween(e.pitch!, midiToFrequency(midis[i]!)))).toBeLessThan(10);
    });
  });

  it('is delayed until the pitch frames after the attack have arrived', () => {
    const sig = silence(1, SR);
    mixAt(sig, ukeNote(64, SR), 0.3, SR);
    const analyzer = new InputAnalyzer(SR);
    const attacher = new OnsetPitchAttacher();
    let emittedAtAnalysisTime = Infinity;
    for (const [b, s] of blocks(sig)) {
      for (const m of analyzer.process(b, s)) {
        const ready = attacher.push(m);
        if (ready.length && emittedAtAnalysisTime === Infinity && m.type === 'frame')
          emittedAtAnalysisTime = m.frame.time;
      }
    }
    // frame times are window centres: the event goes out once a frame centred >= onset+0.14 exists
    expect(emittedAtAnalysisTime).toBeGreaterThanOrEqual(0.3 + 0.14);
    expect(emittedAtAnalysisTime).toBeLessThan(0.3 + 0.14 + 0.02);
  });

  it('emits no pitch when nothing voiced follows the onset (a percussive tap)', () => {
    const attacher = new OnsetPitchAttacher();
    const msgs: AnalyzerMessage[] = [
      { type: 'input', event: { time: 1, kind: 'onset', velocity: 0.5 } },
      {
        type: 'frame',
        frame: { time: 1.05, rmsDb: -30, peakDb: -20, pitchHz: null, clarity: 0.2 },
      },
      {
        type: 'frame',
        frame: { time: 1.15, rmsDb: -40, peakDb: -30, pitchHz: null, clarity: 0.2 },
      },
    ];
    const out = msgs.flatMap((m) => attacher.push(m));
    expect(out).toEqual([{ time: 1, kind: 'onset', velocity: 0.5 }]);
  });

  it('ignores attack-transient frames before the skip window', () => {
    const attacher = new OnsetPitchAttacher({ skip: 0.04, until: 0.14 });
    const frame = (time: number, pitchHz: number | null): AnalyzerMessage => ({
      type: 'frame',
      frame: { time, rmsDb: -20, peakDb: -10, pitchHz, clarity: 0.95 },
    });
    attacher.push({ type: 'input', event: { time: 1, kind: 'onset' } });
    attacher.push(frame(1.01, 999)); // junk during the attack
    attacher.push(frame(1.06, 440));
    attacher.push(frame(1.1, 442));
    attacher.push(frame(1.12, 441));
    const [e] = attacher.push(frame(1.15, 441));
    expect(e!.pitch).toBe(441);
  });

  it('flush emits pending onsets with whatever is known', () => {
    const attacher = new OnsetPitchAttacher();
    attacher.push({ type: 'input', event: { time: 2, kind: 'onset' } });
    expect(attacher.flush()).toEqual([{ time: 2, kind: 'onset' }]);
    expect(attacher.flush()).toEqual([]);
  });

  it('handles rapid successive onsets in order', () => {
    const sig = silence(2, SR);
    [60, 64, 67, 72].forEach((m, i) =>
      mixAt(sig, ukeNote(m, SR, { seed: 9 + i, duration: 0.22 }), 0.3 + i * 0.25, SR),
    );
    const { out } = run(sig);
    expect(out).toHaveLength(4);
    expect(out.map((e) => Math.round(12 * Math.log2(e.pitch! / 440) + 69))).toEqual([
      60, 64, 67, 72,
    ]);
  });

  /**
   * KNOWN LIMITATION (monophonic pitch tracking): when the previous note is
   * still ringing, the two pitches blend. 659 Hz + 880 Hz share a 220 Hz
   * period, so the tracker confidently reports 220 Hz (two octaves down) for
   * the A5, and other notes come back with no usable pitch. The onsets are
   * still found, so timing-only judging works; pitch matching on overlapped
   * melodies does not. If this test starts failing because the detector got
   * better, great: update it and the README "Limitations" note.
   */
  it('KNOWN LIMITATION: overlapping ringing notes confuse pitch attachment (onsets are still found)', () => {
    const midis = [60, 64, 67, 69, 72, 76, 81];
    const sig = silence(0.4 + midis.length * 0.6 + 0.5, SR);
    midis.forEach((m, i) =>
      mixAt(sig, ukeNote(m, SR, { seed: i + 1, duration: 0.9 }), 0.4 + i * 0.6, SR),
    );
    const { out } = run(sig);
    expect(out).toHaveLength(midis.length); // every onset is still reported
    const wrongOrMissing = out.filter((e, i) => {
      if (e.pitch === undefined) return true;
      return Math.abs(centsBetween(e.pitch, midiToFrequency(midis[i]!))) > 50;
    });
    expect(wrongOrMissing.length).toBeGreaterThanOrEqual(2);
  });
});
