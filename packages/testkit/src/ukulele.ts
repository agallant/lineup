import { karplusStrong, mixAt, pluck, rng } from './synth';

/** Open-string MIDI notes in string order 4 -> 1 (G C E A, re-entrant). */
export const UKE_OPEN_MIDI: readonly [number, number, number, number] = [67, 60, 64, 69];

/** Chord shapes as frets on strings 4 -> 1 (G C E A). */
export const UKE_CHORDS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  C: [0, 0, 0, 3],
  G: [0, 2, 3, 2],
  Am: [2, 0, 0, 0],
  F: [2, 0, 1, 0],
  D: [2, 2, 2, 0],
  Em: [0, 4, 3, 2],
  Dm: [2, 2, 1, 0],
  A: [2, 1, 0, 0],
  G7: [0, 2, 1, 2],
  C7: [0, 0, 0, 1],
  A7: [0, 1, 0, 0],
  D7: [2, 0, 2, 0],
};

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export interface StrumOptions {
  direction?: 'down' | 'up';
  /** Time between successive strings, ms (a strum takes ~3x this to cross the strings). */
  stringGapMs?: number;
  amplitude?: number;
  /** How long each string rings, seconds. */
  duration?: number;
  seed?: number;
}

/**
 * One strum of a chord shape. Sample 0 is the first string's attack. Strings
 * get slightly different loudness and a touch of inharmonic body resonance,
 * like a real instrument. Down strokes hit G, C, E, A in that order; up
 * strokes the reverse.
 */
export function ukeStrum(
  frets: readonly [number, number, number, number],
  sampleRate: number,
  {
    direction = 'down',
    stringGapMs = 7,
    amplitude = 0.3,
    duration = 0.9,
    seed = 1,
  }: StrumOptions = {},
): Float32Array {
  const r = rng(seed);
  const gap = stringGapMs / 1000;
  const out = new Float32Array(Math.round((duration + 4 * gap) * sampleRate));
  const order = direction === 'down' ? [0, 1, 2, 3] : [3, 2, 1, 0];
  order.forEach((stringIdx, k) => {
    const hz = midiToHz(UKE_OPEN_MIDI[stringIdx]! + frets[stringIdx]!);
    const a = amplitude * (0.85 + 0.15 * (r() + 1)); // 0.85..1.15
    const body = pluck(hz, duration, sampleRate, {
      amplitude: a * 0.25,
      decay: 0.35,
      inharmonicity: 2e-4,
    });
    const string = karplusStrong(hz, duration, sampleRate, {
      amplitude: a,
      damping: 0.9965,
      seed: Math.floor((r() + 1) * 1e6),
    });
    mixAt(out, string, k * gap, sampleRate);
    mixAt(out, body, k * gap, sampleRate);
  });
  return out;
}

export interface UkeNoteOptions {
  amplitude?: number;
  duration?: number;
  seed?: number;
}

/** A single plucked note at a concert MIDI pitch (fractional allowed, for detuning). */
export function ukeNote(
  midi: number,
  sampleRate: number,
  { amplitude = 0.4, duration = 0.9, seed = 1 }: UkeNoteOptions = {},
): Float32Array {
  const hz = midiToHz(midi);
  const out = karplusStrong(hz, duration, sampleRate, { amplitude, damping: 0.9965, seed });
  const body = pluck(hz, duration, sampleRate, {
    amplitude: amplitude * 0.25,
    decay: 0.35,
    inharmonicity: 2e-4,
  });
  for (let i = 0; i < out.length; i++) out[i]! += body[i]!;
  return out;
}
