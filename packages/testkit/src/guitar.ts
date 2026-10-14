import { midiToHz, type StrumOptions } from './ukulele';
import { karplusStrong, mixAt, pluck, rng } from './synth';

/** Open-string MIDI notes in string order 6 -> 1 (E A D G B E). */
export const GUITAR_OPEN_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

/**
 * One strum of a guitar chord shape (frets on strings 6 -> 1; null is a muted string). Down strokes
 * hit the low E first, up strokes the high E.
 */
export function guitarStrum(
  frets: readonly (number | null)[],
  sampleRate: number,
  {
    direction = 'down',
    stringGapMs = 6,
    amplitude = 0.3,
    duration = 0.9,
    seed = 1,
  }: StrumOptions = {},
  open: readonly number[] = GUITAR_OPEN_MIDI,
): Float32Array {
  const r = rng(seed);
  const gap = stringGapMs / 1000;
  const out = new Float32Array(Math.round((duration + 6 * gap) * sampleRate));
  const strings = frets.map((_, i) => i);
  const order = direction === 'down' ? strings : [...strings].reverse();
  order.forEach((stringIdx, k) => {
    const fret = frets[stringIdx];
    if (fret === null || fret === undefined) return;
    const hz = midiToHz(open[stringIdx]! + fret);
    const a = amplitude * (0.85 + 0.15 * (r() + 1));
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

/** Chord shapes as frets on strings 6 -> 1 (E A D G B E); null is a muted string. Kept equal to the app's table by a test in @lineup/sim. */
export const GUITAR_CHORDS: Readonly<Record<string, readonly (number | null)[]>> = {
  C: [null, 3, 2, 0, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  Am: [null, 0, 2, 2, 1, 0],
  F: [1, 3, 3, 2, 1, 1],
  D: [null, null, 0, 2, 3, 2],
  Em: [0, 2, 2, 0, 0, 0],
  Dm: [null, null, 0, 2, 3, 1],
  A: [null, 0, 2, 2, 2, 0],
  G7: [3, 2, 0, 0, 0, 1],
  C7: [null, 3, 2, 3, 1, 0],
  A7: [null, 0, 2, 0, 2, 0],
  D7: [null, null, 0, 2, 1, 2],
  Bm: [null, 2, 4, 4, 3, 2],
  Bb: [null, 1, 3, 3, 3, 1],
  Gm: [3, 5, 5, 3, 3, 3],
  Cm: [null, 3, 5, 5, 4, 3],
  'F#m': [2, 4, 4, 2, 2, 2],
  E: [0, 2, 2, 1, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  B7: [null, 2, 1, 2, 0, 2],
};
