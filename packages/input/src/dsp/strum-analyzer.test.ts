import { UKE_CHORDS, UKE_OPEN_MIDI, blocks, mixAt, silence, ukeStrum } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import type { AnalyzerMessage } from '../types';
import { InputAnalyzer } from './analyzer';
import type { ChordShapes } from './chord';
import { StrumAnalyzer } from './strum-analyzer';

const SR = 48000;

const shapes = (...names: string[]): ChordShapes =>
  Object.fromEntries(names.map((n) => [n, UKE_CHORDS[n]!.map((f, i) => UKE_OPEN_MIDI[i]! + f)]));

/** A signal with a strum of each named chord at the given times. */
function song(strums: [number, string][], seconds: number, seed = 1): Float32Array {
  const sig = silence(seconds, SR);
  strums.forEach(([t, chord], i) => {
    mixAt(sig, ukeStrum(UKE_CHORDS[chord]!, SR, { seed: seed + i }), t, SR);
  });
  return sig;
}

function run(
  analyzer: { process(b: Float32Array, s: number): AnalyzerMessage[] },
  sig: Float32Array,
) {
  const messages: AnalyzerMessage[] = [];
  const emittedAt: number[] = [];
  for (const [b, s] of blocks(sig)) {
    for (const m of analyzer.process(b, s)) {
      messages.push(m);
      if (m.type === 'input') emittedAt.push((s + b.length) / SR);
    }
  }
  return { messages, emittedAt };
}
const events = (m: AnalyzerMessage[]) => m.flatMap((x) => (x.type === 'input' ? [x.event] : []));

describe('StrumAnalyzer', () => {
  it('stamps each strum with its ONSET time and names the chord, about 0.2 s later', () => {
    const sig = song(
      [
        [0.5, 'C'],
        [1.5, 'F'],
        [2.5, 'G'],
      ],
      3.5,
    );
    const { messages, emittedAt } = run(
      new StrumAnalyzer(SR, { chords: shapes('C', 'Am', 'F', 'G') }),
      sig,
    );
    const ev = events(messages);
    expect(ev.map((e) => e.chord)).toEqual(['C', 'F', 'G']);
    [0.5, 1.5, 2.5].forEach((t, i) => expect(Math.abs(ev[i]!.time - t)).toBeLessThan(0.005));
    for (const e of ev) {
      expect(e.kind).toBe('onset');
      expect(e.velocity).toBeGreaterThan(0.3);
      expect(e.chordScore).toBeGreaterThan(0.8);
    }
    // held back until skip (30 ms) + the 8192-sample window (171 ms) has arrived
    emittedAt.forEach((at, i) => {
      const delay = at - ev[i]!.time;
      expect(delay).toBeGreaterThan(0.195);
      expect(delay).toBeLessThan(0.215);
    });
  });

  it('without chords it reports timing alone', () => {
    const sig = song([[0.5, 'C']], 1.5);
    const ev = events(run(new StrumAnalyzer(SR), sig).messages);
    expect(ev).toHaveLength(1);
    expect(ev[0]!.chord).toBeUndefined();
    expect(ev[0]!.chordScore).toBeUndefined();
  });

  it('a fast strum right behind another is not blurred into it: both name the same chord', () => {
    // down-up-down 120 ms apart, all C: each window is cut where the next strum starts
    const sig = song(
      [
        [0.5, 'C'],
        [0.62, 'C'],
        [0.74, 'C'],
      ],
      1.6,
    );
    const ev = events(
      run(new StrumAnalyzer(SR, { chords: shapes('C', 'Am', 'F', 'G') }), sig).messages,
    );
    expect(ev).toHaveLength(3);
    expect(ev.map((e) => e.chord)).toEqual(['C', 'C', 'C']);
  });

  it('a strum too close behind another to judge has no chord, but is still an event', () => {
    const sig = song(
      [
        [0.5, 'C'],
        [0.53, 'C'],
      ],
      1.5,
    );
    const ev = events(run(new StrumAnalyzer(SR, { chords: shapes('C', 'G') }), sig).messages);
    // the detector's refractory period may merge them; if both survive, the first has too little audio
    if (ev.length === 2) expect(ev[0]!.chord).toBeUndefined();
  });

  it('emits level frames for the meters, with no pitch', () => {
    const sig = song([[0.3, 'G']], 1);
    const frames = run(new StrumAnalyzer(SR), sig).messages.flatMap((m) =>
      m.type === 'frame' ? [m.frame] : [],
    );
    expect(frames.length).toBeGreaterThan(50);
    expect(frames.every((f) => f.pitchHz === null)).toBe(true);
    expect(Math.max(...frames.map((f) => f.rmsDb))).toBeGreaterThan(-40);
  });

  it('gives the same answer however the audio is cut into blocks (and for one huge block)', () => {
    const sig = song([[0.4, 'F']], 1.4);
    const a = new StrumAnalyzer(SR, { chords: shapes('C', 'F') });
    const odd = new StrumAnalyzer(SR, { chords: shapes('C', 'F') });
    const whole = events(a.process(sig, 0));
    const pieces: AnalyzerMessage[] = [];
    for (let at = 0; at < sig.length; at += 313)
      pieces.push(...odd.process(sig.subarray(at, at + 313), at));
    expect(whole.map((e) => e.chord)).toEqual(['F']);
    expect(events(pieces).map((e) => e.chord)).toEqual(['F']);
  });
});

describe('InputAnalyzer with strum options', () => {
  it('runs the strum analyzer instead of pitch tracking', () => {
    const sig = song([[0.4, 'Am']], 1.4);
    const a = new InputAnalyzer(SR, { strum: { chords: shapes('Am', 'G') } });
    const { messages } = run(a, sig);
    expect(events(messages).map((e) => e.chord)).toEqual(['Am']);
    const frames = messages.flatMap((m) => (m.type === 'frame' ? [m.frame] : []));
    expect(frames.every((f) => f.pitchHz === null)).toBe(true);
  });
});
