import type { Chart } from './chart';
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
};

/** The MIDI notes a chord sounds on an instrument with a tuning, or null when the chord is unknown. */
export function chordMidis(profile: InstrumentProfile, chord: string): number[] | null {
  const strings = profile.tuning?.strings;
  const frets = Object.hasOwn(UKULELE_CHORD_FRETS, chord) ? UKULELE_CHORD_FRETS[chord] : undefined;
  if (!strings || !frets || frets.length !== strings.length) return null;
  return strings.map((s, i) => s.midi + frets[i]!);
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
