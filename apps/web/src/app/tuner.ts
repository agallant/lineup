import { centsBetween, midiToFrequency } from '@lineup/core';

/** A tuning: the open strings to tune, as MIDI notes, and what to call them. */
export interface Tuning {
  id: string;
  label: string;
  /** Empty for the chromatic tuner, which names any note. */
  strings: readonly { name: string; midi: number }[];
  /** Strings below about 60 Hz (a bass): the microphone listens for lower notes, over a longer window. */
  low?: boolean;
}

/** What the microphone listens for when tuning: lower and slower for a bass, else the usual range. */
export const tunerPitchOptions = (
  tuning: Pick<Tuning, 'low'>,
): { minHz: number; windowSize?: number } =>
  tuning.low ? { minHz: 30, windowSize: 4096 } : { minHz: 60 };

export const TUNINGS: readonly Tuning[] = [
  {
    id: 'ukulele',
    label: 'Ukulele (G C E A)',
    strings: [
      { name: 'G4', midi: 67 },
      { name: 'C4', midi: 60 },
      { name: 'E4', midi: 64 },
      { name: 'A4', midi: 69 },
    ],
  },
  {
    id: 'ukulele-low-g',
    label: 'Ukulele, low G (G3 C E A)',
    strings: [
      { name: 'G3', midi: 55 },
      { name: 'C4', midi: 60 },
      { name: 'E4', midi: 64 },
      { name: 'A4', midi: 69 },
    ],
  },
  {
    id: 'baritone',
    label: 'Baritone ukulele (D G B E)',
    strings: [
      { name: 'D3', midi: 50 },
      { name: 'G3', midi: 55 },
      { name: 'B3', midi: 59 },
      { name: 'E4', midi: 64 },
    ],
  },
  {
    id: 'bass',
    label: 'Bass guitar (E A D G)',
    low: true,
    strings: [
      { name: 'E1', midi: 28 },
      { name: 'A1', midi: 33 },
      { name: 'D2', midi: 38 },
      { name: 'G2', midi: 43 },
    ],
  },
  { id: 'chromatic', label: 'Any note (chromatic)', strings: [] },
];

/** "In tune" means within this many cents. */
export const IN_TUNE_CENTS = 5;

export interface TunerReading {
  /** The string being tuned (null in chromatic mode), or the nearest note's name. */
  name: string;
  midi: number;
  /** Signed cents from the target: positive is sharp. */
  cents: number;
  state: 'in-tune' | 'flat' | 'sharp';
  /** What to do: "Tune up", "Tune down" or "In tune". */
  advice: string;
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const noteName = (midi: number): string =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Which string (or note) a pitch is nearest, how far off it is, and what to do about it. With a
 * `target` string name, the pitch is measured against that string instead of the nearest one.
 */
export function readTuner(hz: number, tuning: Tuning, target?: string): TunerReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  let midi: number;
  let name: string;
  if (tuning.strings.length === 0) {
    midi = Math.round(69 + 12 * Math.log2(hz / 440));
    name = noteName(midi);
  } else {
    // a string chosen by the player wins, even when the pitch is nearer another one (a string far
    // out of tune); otherwise the nearest string
    const chosen = tuning.strings.find((s) => s.name === target);
    const nearest = tuning.strings.reduce((best, s) =>
      Math.abs(centsBetween(hz, midiToFrequency(s.midi))) <
      Math.abs(centsBetween(hz, midiToFrequency(best.midi)))
        ? s
        : best,
    );
    const best = chosen ?? nearest;
    midi = best.midi;
    name = best.name;
  }
  const cents = centsBetween(hz, midiToFrequency(midi));
  const state = Math.abs(cents) <= IN_TUNE_CENTS ? 'in-tune' : cents < 0 ? 'flat' : 'sharp';
  return {
    name,
    midi,
    cents,
    state,
    advice:
      state === 'in-tune'
        ? 'In tune'
        : state === 'flat'
          ? 'Too low: tune up'
          : 'Too high: tune down',
  };
}
