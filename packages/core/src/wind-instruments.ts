import type { Chart } from './chart';
import { midiLabel } from './notes';

/** The kinds of simple wind instrument Windline knows. */
export type WindFamily = 'whistle' | 'recorder' | 'ocarina';

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

/** The instruments offered, most common first. */
export const WIND_INSTRUMENTS: readonly WindInstrument[] = [
  whistle('whistle-d', 'Tin whistle in D', 74),
  whistle('whistle-c', 'Tin whistle in C', 72),
  whistle('whistle-bb', 'Tin whistle in B♭', 70),
  whistle('whistle-a', 'Tin whistle in A', 69),
  whistle('whistle-g', 'Tin whistle in G', 67),
  whistle('whistle-f', 'Tin whistle in F', 65),
  whistle('whistle-eb', 'Tin whistle in E♭', 63),
  whistle('whistle-low-d', 'Low whistle in D', 62),
  recorder('recorder-soprano', 'Soprano recorder (C)', 72),
  recorder('recorder-alto', 'Alto recorder (F)', 65),
  recorder('recorder-tenor', 'Tenor recorder (C)', 60),
  recorder('recorder-sopranino', 'Sopranino recorder (F)', 77),
  {
    id: 'ocarina-c12',
    label: '12-hole ocarina (C)',
    family: 'ocarina',
    tonic: 72,
    range: { low: 69, high: 89 },
  },
];

export const DEFAULT_WIND_INSTRUMENT = 'whistle-d';

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
 * "1" covered, "0" open.
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
  return [];
}

/** Semitones above the tonic of the notes of a major scale over two octaves and a bit. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];

/**
 * Whistle fingerings by scale degree (0 = tonic), holes 1 to 6 from the top. The second octave
 * reuses the first octave's fingerings with a stronger breath, except the upper tonic, which
 * opens the top hole.
 */
const WHISTLE: readonly Fingering[] = [
  { holes: '111111', harder: false },
  { holes: '111110', harder: false },
  { holes: '111100', harder: false },
  { holes: '111000', harder: false },
  { holes: '110000', harder: false },
  { holes: '100000', harder: false },
  { holes: '000000', harder: false },
  { holes: '011111', harder: true }, // upper tonic
  { holes: '111110', harder: true },
  { holes: '111100', harder: true },
  { holes: '111000', harder: true },
  { holes: '110000', harder: true },
  { holes: '100000', harder: true },
  { holes: '000000', harder: true },
];

/**
 * Recorder fingerings (Baroque / English system) by scale degree: thumb hole, holes 1 to 3, then
 * holes 4 to 7, where 6 and 7 are the double holes (both halves covered). Eight notes of the
 * major scale and the ninth, which is all most songs need; higher notes are left to the maker's chart.
 */
const RECORDER: readonly Fingering[] = [
  { holes: '1 111 1111', harder: false },
  { holes: '1 111 1110', harder: false },
  { holes: '1 111 1100', harder: false },
  { holes: '1 111 1011', harder: false }, // the fourth: hole 5 open, 6 and 7 covered
  { holes: '1 111 0000', harder: false },
  { holes: '1 110 0000', harder: false },
  { holes: '1 100 0000', harder: false },
  { holes: '1 010 0000', harder: false }, // upper tonic: thumb and hole 2
  { holes: '0 010 0000', harder: false }, // hole 2 alone
].map((f) => ({ ...f, holes: f.holes.replaceAll(' ', '') }));

const TABLES: Record<WindFamily, readonly Fingering[]> = {
  whistle: WHISTLE,
  recorder: RECORDER,
  ocarina: [],
};

/** One note of the instrument's scale, with the fingering to play it. */
export interface ScaleNote {
  midi: number;
  label: string;
  fingering: Fingering;
}

/** The notes the instrument can finger in its own major scale, lowest first. */
export function windScale(instrument: WindInstrument): ScaleNote[] {
  const table = TABLES[instrument.family];
  return table.map((fingering, degree) => {
    const midi = instrument.tonic + MAJOR[degree]!;
    return { midi, label: midiLabel(midi), fingering };
  });
}

/** The fingering for a note, or null when the instrument has no chart or the note is not in its scale. */
export function fingeringFor(instrument: WindInstrument, midi: number): Fingering | null {
  const degree = MAJOR.indexOf(midi - instrument.tonic);
  if (degree < 0) return null;
  return TABLES[instrument.family][degree] ?? null;
}

/** What is wrong with playing a song's notes on this instrument; empty arrays when it fits. */
export interface Fit {
  /** Notes (MIDI) below or above the instrument's range. */
  outOfRange: number[];
  /** Notes in range that are not in its scale (a chromatic note on a diatonic instrument). */
  notInScale: number[];
}

export function checkFit(notes: Iterable<number>, instrument: WindInstrument): Fit {
  const outOfRange = new Set<number>();
  const notInScale = new Set<number>();
  for (const m of notes) {
    if (m < instrument.range.low || m > instrument.range.high) outOfRange.add(m);
    else if (instrument.family !== 'ocarina' && fingeringFor(instrument, m) === null)
      notInScale.add(m);
  }
  const byPitch = (a: number, b: number) => a - b;
  return { outOfRange: [...outOfRange].sort(byPitch), notInScale: [...notInScale].sort(byPitch) };
}
