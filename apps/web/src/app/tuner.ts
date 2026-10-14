import { centsBetween } from '@lineup/core';

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

/** The reference pitch of A4, Hz: the usual 440, adjustable for old instruments and ensembles. */
export const DEFAULT_A4 = 440;
export const A4_RANGE = { min: 415, max: 466 } as const;

/** The frequency of a MIDI note when A4 is `a4` Hz. */
export const noteHz = (midi: number, a4 = DEFAULT_A4): number => a4 * 2 ** ((midi - 69) / 12);

/** Keeps a reference pitch in a sensible range (whole Hz). */
export const clampA4 = (hz: number): number =>
  Number.isFinite(hz) ? Math.min(A4_RANGE.max, Math.max(A4_RANGE.min, Math.round(hz))) : DEFAULT_A4;

export const TUNINGS: readonly Tuning[] = [
  { id: 'chromatic', label: 'Any note (chromatic)', strings: [] },
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
    id: 'guitar',
    label: 'Guitar (E A D G B E)',
    low: true,
    strings: [
      { name: 'E2', midi: 40 },
      { name: 'A2', midi: 45 },
      { name: 'D3', midi: 50 },
      { name: 'G3', midi: 55 },
      { name: 'B3', midi: 59 },
      { name: 'E4', midi: 64 },
    ],
  },
  {
    id: 'guitar-drop-d',
    label: 'Guitar, drop D (D A D G B E)',
    low: true,
    strings: [
      { name: 'D2', midi: 38 },
      { name: 'A2', midi: 45 },
      { name: 'D3', midi: 50 },
      { name: 'G3', midi: 55 },
      { name: 'B3', midi: 59 },
      { name: 'E4', midi: 64 },
    ],
  },
  {
    id: 'guitar-dadgad',
    label: 'Guitar, DADGAD',
    low: true,
    strings: [
      { name: 'D2', midi: 38 },
      { name: 'A2', midi: 45 },
      { name: 'D3', midi: 50 },
      { name: 'G3', midi: 55 },
      { name: 'A3', midi: 57 },
      { name: 'D4', midi: 62 },
    ],
  },
  {
    id: 'guitar-open-g',
    label: 'Guitar, open G (D G D G B D)',
    low: true,
    strings: [
      { name: 'D2', midi: 38 },
      { name: 'G2', midi: 43 },
      { name: 'D3', midi: 50 },
      { name: 'G3', midi: 55 },
      { name: 'B3', midi: 59 },
      { name: 'D4', midi: 62 },
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

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (midi: number): string =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

/**
 * Which string (or note) a pitch is nearest, how far off it is, and what to do about it. With a
 * `target` string name, the pitch is measured against that string instead of the nearest one.
 */
export function readTuner(
  hz: number,
  tuning: Tuning,
  target?: string,
  a4 = DEFAULT_A4,
): TunerReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  let midi: number;
  let name: string;
  if (tuning.strings.length === 0) {
    midi = Math.round(69 + 12 * Math.log2(hz / a4));
    name = noteName(midi);
  } else {
    // a string chosen by the player wins, even when the pitch is nearer another one (a string far
    // out of tune); otherwise the nearest string
    const chosen = tuning.strings.find((s) => s.name === target);
    const nearest = tuning.strings.reduce((best, s) =>
      Math.abs(centsBetween(hz, noteHz(s.midi, a4))) <
      Math.abs(centsBetween(hz, noteHz(best.midi, a4)))
        ? s
        : best,
    );
    const best = chosen ?? nearest;
    midi = best.midi;
    name = best.name;
  }
  const cents = centsBetween(hz, noteHz(midi, a4));
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

/**
 * Steadies a stream of pitch readings: the median of the last few, so one stray reading (an octave
 * jump on a note's attack) never reaches the needle, and nothing at all after a pause.
 */
export class PitchSmoother {
  private readings: { hz: number; at: number }[] = [];

  /** @param keep how many readings the median covers; @param window seconds after which one is stale. */
  constructor(
    private readonly keep = 5,
    private readonly window = 0.5,
  ) {}

  /** Adds a reading (Hz at time `at`, seconds) and returns the steadied pitch. */
  push(hz: number, at: number): number {
    this.readings = this.readings.filter((r) => at - r.at <= this.window);
    this.readings.push({ hz, at });
    if (this.readings.length > this.keep) this.readings.shift();
    const sorted = this.readings.map((r) => r.hz).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]!;
  }

  reset(): void {
    this.readings = [];
  }
}

/** Tuning families for the picker: the universal tuner first, then the instruments. */
export const TUNING_GROUPS: readonly { label: string; ids: readonly string[] }[] = [
  { label: 'Any instrument or voice', ids: ['chromatic'] },
  { label: 'Ukulele', ids: ['ukulele', 'ukulele-low-g', 'baritone'] },
  {
    label: 'Guitar',
    ids: ['guitar', 'guitar-drop-d', 'guitar-dadgad', 'guitar-open-g'],
  },
  { label: 'Bass', ids: ['bass'] },
];
