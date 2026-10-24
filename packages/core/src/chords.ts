import type { Chart, ChartNote } from './chart';
import { UKULELE_OPEN, chordVoicings } from './chord-shapes';
import { ROOT_NAMES, canonicalChordName, parseChordName } from './chord-theory';
import { GUITAR_STANDARD, guitarFamily, retuneFrets } from './guitar';
import type { InstrumentProfile } from './profile';

/** Ukulele chord fingerings as frets on strings 4 -> 1 (the order of the profile's tuning: G C E A). */
export const UKULELE_CHORD_FRETS: Readonly<Record<string, readonly number[]>> = {
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
  Bm: [4, 2, 2, 2],
  Bb: [3, 2, 1, 1],
  Gm: [0, 2, 3, 1],
  Cm: [0, 3, 3, 3],
  'F#m': [2, 1, 2, 0],
  E: [4, 4, 4, 2],
  E7: [1, 2, 0, 2],
  B7: [2, 3, 2, 2],
};

/** Guitar chord fingerings (open position) as frets on strings 6 -> 1 (E A D G B E); null is a muted string. */
export const GUITAR_CHORD_FRETS: Readonly<Record<string, readonly (number | null)[]>> = {
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

const tuned = new Map<string, Readonly<Record<string, readonly (number | null)[]>>>();

/** The chord fingerings for an instrument profile: a guitar's (in its tuning), else the ukulele's. */
export function chordFretsFor(
  profileId: string | undefined,
): Readonly<Record<string, readonly (number | null)[]>> {
  const g = guitarFamily(profileId);
  if (!g) return UKULELE_CHORD_FRETS;
  if (g.tuning.open === GUITAR_STANDARD) return GUITAR_CHORD_FRETS;
  let t = tuned.get(g.tuning.suffix);
  if (!t) {
    t = Object.fromEntries(
      Object.entries(GUITAR_CHORD_FRETS).map(([name, f]) => [name, retuneFrets(f, g.tuning.open)]),
    );
    tuned.set(g.tuning.suffix, t);
  }
  return t;
}

const made = new Map<string, readonly (number | null)[] | null>();

/**
 * The fingering of any chord the games name ("C", "F#m7", "Bsus4", "G/B") on an instrument profile:
 * the hand-picked one when there is one, else the easiest the shape search finds (a barre chord
 * for a sharp or flat key). Null for a name that is not a chord.
 */
export function chordFrets(
  profileId: string | undefined,
  chord: string,
): readonly (number | null)[] | null {
  const curated = chordFretsFor(profileId);
  if (Object.hasOwn(curated, chord)) return curated[chord]!;
  const name = canonicalChordName(chord);
  if (name === null) return null;
  if (Object.hasOwn(curated, name)) return curated[name]!;
  const g = guitarFamily(profileId);
  // two-note power chords are a guitar's: the ukulele plays the major chord of the same root
  const parsed = parseChordName(name);
  if (!g && parsed?.quality.id === '5') return chordFrets(profileId, ROOT_NAMES[parsed.root]!);
  const key = `${g ? g.tuning.suffix || 'standard' : 'ukulele'}|${name}`;
  if (!made.has(key)) {
    const best = chordVoicings(g ? g.tuning.open : UKULELE_OPEN, name, g !== null)[0];
    made.set(key, best?.frets ?? null);
  }
  return made.get(key)!;
}

/** Whether the ukulele has a fingering for the chord (every chord the games name has one). */
export const ukuleleHasChord = (chord: string): boolean => chordFrets(undefined, chord) !== null;

/**
 * The fret to hold on each string for a note, in tuning order: the chart's own `frets` when it
 * gives them, else the fingering of its chord on the instrument (the ukulele unless `profileId`
 * names a guitar), else null (nothing to show).
 */
export function noteFrets(note: ChartNote, profileId?: string): readonly (number | null)[] | null {
  const explicit = note.expected?.frets;
  // frets written for another instrument (four strings against six) are not this one's
  if (explicit && explicit.length === (guitarFamily(profileId) ? 6 : 4)) return explicit;
  const chord = note.expected?.chord;
  return chord === undefined ? null : chordFrets(profileId, chord);
}

/** The MIDI notes a chord sounds on an instrument with a tuning, or null when the chord is unknown. */
export function chordMidis(profile: InstrumentProfile, chord: string): number[] | null {
  const strings = profile.tuning?.strings;
  const frets = chordFrets(profile.id, chord);
  if (!strings || !frets || frets.length !== strings.length) return null;
  // a muted string sounds nothing
  return strings.flatMap((s, i) => (frets[i] === null ? [] : [s.midi + frets[i]!]));
}

/** The distinct chords a chart expects, in order of first appearance. */
export function chartChords(chart: Chart): string[] {
  const seen = new Set<string>();
  for (const n of chart.notes) {
    const c = n.expected?.chord;
    if (c !== undefined) seen.add(c);
  }
  return [...seen];
}

/**
 * Chord name -> sounding MIDI notes for the given chords, ready for the chord
 * recognizer. Throws on a chord the instrument has no fingering for, so a
 * typo in a song fails loudly instead of never matching.
 */
export function chordShapesFor(
  profile: InstrumentProfile,
  chords: Iterable<string>,
): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const c of chords) {
    const midis = chordMidis(profile, c);
    if (!midis) throw new Error(`no fingering for chord "${c}" on profile "${profile.id}"`);
    out[c] = midis;
  }
  return out;
}
