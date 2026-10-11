import type { Chart } from './chart';
import { midiLabel } from './notes';

/** The kinds of simple wind instrument Windline knows. */
export type WindFamily = 'whistle' | 'recorder' | 'generic';

/**
 * A simple wind instrument in a particular key. Whistles and recorders are diatonic: their
 * fingerings are the same for every key, written by scale degree, and only the pitch of the
 * lowest note (the tonic) changes. So a whistle in C, D or B-flat shares one chart.
 */
export interface WindInstrument {
  id: string;
  label: string;
  family: WindFamily;
  /** MIDI note of the lowest note, which is also the tonic of the scale its fingerings are written in. */
  tonic: number;
  /** Lowest and highest note it can play (MIDI), whether or not a fingering is shown for it. */
  range: { low: number; high: number };
}

/** The highest note the wind profile's pitch tracker handles (C7). */
const TOP_NOTE = 96;

const whistle = (id: string, label: string, tonic: number): WindInstrument => ({
  id,
  label,
  family: 'whistle',
  tonic,
  range: { low: tonic, high: Math.min(tonic + 23, TOP_NOTE) },
});
const recorder = (id: string, label: string, tonic: number): WindInstrument => ({
  id,
  label,
  family: 'recorder',
  tonic,
  range: { low: tonic, high: tonic + 14 },
});

/**
 * The instrument chosen until you pick a specific one: any wind instrument, in C until you set
 * its key with the semitone shift (+2 is D, see {@link inKey}). It has no fingering chart and no
 * scale of its own, so only its range is checked.
 */
export const GENERIC_WIND_INSTRUMENT: WindInstrument = {
  id: 'generic',
  label: 'Generic (C, set your own key)',
  family: 'generic',
  tonic: 72,
  range: { low: 72, high: 72 + 23 },
};

export const DEFAULT_WIND_INSTRUMENT = GENERIC_WIND_INSTRUMENT.id;

/** The generic instrument first, then the specific ones (presets): recorders, then whistles. */
export const WIND_INSTRUMENTS: readonly WindInstrument[] = [
  GENERIC_WIND_INSTRUMENT,
  recorder('recorder-soprano', 'Soprano recorder (C)', 72),
  recorder('recorder-alto', 'Alto recorder (F)', 65),
  recorder('recorder-tenor', 'Tenor recorder (C)', 60),
  recorder('recorder-sopranino', 'Sopranino recorder (F)', 77),
  whistle('whistle-d', 'Tin whistle in D', 74),
  whistle('whistle-c', 'Tin whistle in C', 72),
  whistle('whistle-bb', 'Tin whistle in B♭', 70),
  whistle('whistle-a', 'Tin whistle in A', 69),
  whistle('whistle-g', 'Tin whistle in G', 67),
  whistle('whistle-f', 'Tin whistle in F', 65),
  whistle('whistle-eb', 'Tin whistle in E♭', 63),
  whistle('whistle-low-d', 'Low whistle in D', 62),
];

/** True for the generic instrument, whose key is the semitone shift you set. */
export const isGenericWind = (instrument: Pick<WindInstrument, 'id'>): boolean =>
  instrument.id === GENERIC_WIND_INSTRUMENT.id;

/** The instrument with its key moved up (or down) by `semitones`: range and tonic move together. */
export function inKey(instrument: WindInstrument, semitones: number): WindInstrument {
  return {
    ...instrument,
    tonic: instrument.tonic + semitones,
    range: {
      low: instrument.range.low + semitones,
      high: Math.min(instrument.range.high + semitones, TOP_NOTE),
    },
  };
}

/** The instrument with this id, or null. */
export function findWindInstrument(id: string): WindInstrument | null {
  return WIND_INSTRUMENTS.find((i) => i.id === id) ?? null;
}

/** Semitones to move a song so it sits in the instrument's key (0 for a song with no stated key). */
export function shiftForInstrument(chart: Pick<Chart, 'meta'>, instrument: WindInstrument): number {
  const tonic = chart.meta.tonic;
  return tonic === undefined ? 0 : instrument.tonic - tonic;
}

/**
 * One fingering. `holes` has one character per hole in the order of {@link holeGroups}:
 * "1" covered, "0" open, "2" half covered (a half-hole, or one half of a recorder's double hole).
 */
export interface Fingering {
  holes: string;
  /** Played with a stronger breath (the second octave of a whistle). */
  harder: boolean;
}

/** How the holes are grouped for drawing, in the order of {@link Fingering.holes}. */
export function holeGroups(family: WindFamily): number[] {
  if (family === 'whistle') return [3, 3]; // top hand, bottom hand
  if (family === 'recorder') return [1, 3, 4]; // thumb, then the left and right hands
  return []; // generic: no holes to draw
}

/** The semitones above the tonic that are notes of the major scale (the rest are chromatic). */
const MAJOR_STEPS: ReadonlySet<number> = new Set([0, 2, 4, 5, 7, 9, 11]);

const f = (holes: string, harder = false): Fingering => ({
  holes: holes.replaceAll(' ', ''),
  harder,
});

/**
 * Whistle fingerings by semitones above the tonic, holes 1 to 6 from the top. The second octave
 * (12 up) reuses the first octave's fingerings with a stronger breath, except the upper tonic,
 * which opens the top hole and a few cross-fingerings that work better another way up there.
 * Notes outside the major scale use half-holes (a hole only partly covered) or cross-fingerings
 * (a hole left open above covered ones); these are the commonly taught ones and differ between
 * whistles, so check them against your own.
 */
const WHISTLE: readonly (Fingering | null)[] = [
  f('111 111'), // 0 D
  f('111 112'), // 1 D#: bottom hole half covered
  f('111 110'), // 2 E
  f('111 011'), // 3 F: cross-fingered
  f('111 100'), // 4 F#
  f('111 000'), // 5 G
  f('110 111'), // 6 G#: cross-fingered
  f('110 000'), // 7 A
  f('101 110'), // 8 A#: cross-fingered
  f('100 000'), // 9 B
  f('011 000'), // 10 C: cross-fingered
  f('000 000'), // 11 C#
  f('011 111', true), // 12 upper D
  f('111 112', true),
  f('111 110', true),
  f('111 011', true),
  f('111 100', true),
  f('111 000', true),
  f('110 100', true), // 18 G#
  f('110 000', true),
  f('110 111', true), // 20 A#
  f('100 000', true),
  f('011 110', true), // 22 C
  f('000 000', true),
];

/**
 * Recorder fingerings (Baroque / English system) by semitones above the tonic: thumb hole, holes 1
 * to 3, then holes 4 to 7, where 6 and 7 are the double holes (both halves covered; half covered
 * is "2"). The chromatic notes use the commonly taught forks and half-holes, which differ between
 * makes. The notes above the upper D are left to the maker's chart.
 */
const RECORDER: readonly (Fingering | null)[] = [
  f('1 111 1111'), // 0 C
  f('1 111 1112'), // 1 C#: bottom hole half covered
  f('1 111 1110'), // 2 D
  f('1 111 1120'), // 3 D#: hole 6 half covered
  f('1 111 1100'), // 4 E
  f('1 111 1011'), // 5 F: hole 5 open, 6 and 7 covered
  f('1 111 0110'), // 6 F#: hole 4 open
  f('1 111 0000'), // 7 G
  f('1 110 1111'), // 8 G#: hole 3 open
  f('1 110 0000'), // 9 A
  f('1 101 1000'), // 10 A#: hole 2 open, 3 and 4 covered
  f('1 100 0000'), // 11 B
  f('1 010 0000'), // 12 upper C: thumb and hole 2
  f('1 011 0000'), // 13 upper C#: thumb, holes 2 and 3
  f('0 010 0000'), // 14 upper D: hole 2 alone
];

const TABLES: Record<WindFamily, readonly (Fingering | null)[]> = {
  whistle: WHISTLE,
  recorder: RECORDER,
  generic: [],
};

/** One note the instrument has a fingering for, with the fingering to play it. */
export interface ScaleNote {
  midi: number;
  label: string;
  fingering: Fingering;
  /** True for a note outside the major scale of the instrument's key (a sharp or flat). */
  chromatic: boolean;
}

/** The notes the instrument has fingerings for, lowest first, chromatic notes included. */
export function windScale(instrument: WindInstrument): ScaleNote[] {
  return TABLES[instrument.family].flatMap((fingering, steps) => {
    if (!fingering) return [];
    const midi = instrument.tonic + steps;
    return [{ midi, label: midiLabel(midi), fingering, chromatic: !MAJOR_STEPS.has(steps % 12) }];
  });
}

/** The fingering for a note, or null when the instrument has no chart or no fingering for the note. */
export function fingeringFor(instrument: WindInstrument, midi: number): Fingering | null {
  const steps = midi - instrument.tonic;
  return (Number.isInteger(steps) && TABLES[instrument.family][steps]) || null;
}

/**
 * The whole octaves (in semitones, a multiple of 12) to move a song's pitch span so it sits best in
 * an instrument's range: the one that leaves the fewest semitones outside it, the smallest move
 * when several are equal. A player may play a song an octave off the chart (a low whistle, an alto
 * recorder, a second octave), so a range check should judge the octave that suits the instrument.
 */
export function bestOctaveShift(
  span: { low: number; high: number },
  range: { low: number; high: number },
): number {
  let best = 0;
  let bestCost = Infinity;
  for (const k of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
    const move = 12 * k;
    const cost =
      Math.max(0, range.low - (span.low + move)) + Math.max(0, span.high + move - range.high);
    if (cost < bestCost) {
      best = move;
      bestCost = cost;
    }
  }
  return best;
}

/** What is wrong with playing a song's notes on this instrument; empty arrays when it fits. */
export interface Fit {
  /** Notes (MIDI) below or above the instrument's range. */
  outOfRange: number[];
  /** Notes in range that the chart has no fingering for. */
  noFingering: number[];
}

export function checkFit(notes: Iterable<number>, instrument: WindInstrument): Fit {
  const outOfRange = new Set<number>();
  const noFingering = new Set<number>();
  for (const m of notes) {
    if (m < instrument.range.low || m > instrument.range.high) outOfRange.add(m);
    else if (instrument.family !== 'generic' && fingeringFor(instrument, m) === null)
      noFingering.add(m);
  }
  const byPitch = (a: number, b: number) => a - b;
  return { outOfRange: [...outOfRange].sort(byPitch), noFingering: [...noFingering].sort(byPitch) };
}
