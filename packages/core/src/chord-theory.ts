/**
 * Chord names: what a name such as "F#m7", "Bb", "Dsus4" or "G/B" stands for (its root, its notes and
 * its bass), and the names the games offer. Fingerings for them are in `chord-shapes.ts`.
 */

/** A kind of chord: its name's ending, the semitones of its notes above the root, and a plain label. */
export interface ChordQuality {
  /** What follows the root in the name ("" major, "m" minor, "7", "maj7"...). */
  id: string;
  label: string;
  /** Semitones above the root, root first. */
  intervals: readonly number[];
  /** True for a chord whose fifth may be left out of a fingering (sevenths and ninths). */
  looseFifth?: boolean;
}

/** The chord qualities the games know, the commonest first. */
export const CHORD_QUALITIES: readonly ChordQuality[] = [
  { id: '', label: 'major', intervals: [0, 4, 7] },
  { id: 'm', label: 'minor', intervals: [0, 3, 7] },
  { id: '7', label: 'dominant seventh', intervals: [0, 4, 7, 10], looseFifth: true },
  { id: 'maj7', label: 'major seventh', intervals: [0, 4, 7, 11], looseFifth: true },
  { id: 'm7', label: 'minor seventh', intervals: [0, 3, 7, 10], looseFifth: true },
  { id: 'sus4', label: 'suspended fourth', intervals: [0, 5, 7] },
  { id: 'sus2', label: 'suspended second', intervals: [0, 2, 7] },
  { id: 'add9', label: 'added ninth', intervals: [0, 2, 4, 7], looseFifth: true },
  { id: '6', label: 'sixth', intervals: [0, 4, 7, 9], looseFifth: true },
  { id: 'm6', label: 'minor sixth', intervals: [0, 3, 7, 9], looseFifth: true },
  { id: '9', label: 'ninth', intervals: [0, 2, 4, 7, 10], looseFifth: true },
  { id: '7sus4', label: 'seventh suspended', intervals: [0, 5, 7, 10], looseFifth: true },
  { id: 'dim', label: 'diminished', intervals: [0, 3, 6] },
  { id: 'dim7', label: 'diminished seventh', intervals: [0, 3, 6, 9] },
  { id: 'm7b5', label: 'half diminished', intervals: [0, 3, 6, 10] },
  { id: 'aug', label: 'augmented', intervals: [0, 4, 8] },
  { id: '5', label: 'power chord', intervals: [0, 7] },
];

/** Other spellings of a quality, mapped to its id. */
const ALIASES: Readonly<Record<string, string>> = {
  maj: '',
  M: '',
  min: 'm',
  '-': 'm',
  M7: 'maj7',
  Maj7: 'maj7',
  '△7': 'maj7',
  min7: 'm7',
  '-7': 'm7',
  sus: 'sus4',
  '2': 'sus2',
  o: 'dim',
  o7: 'dim7',
  '°': 'dim',
  '°7': 'dim7',
  '+': 'aug',
  ø: 'm7b5',
  ø7: 'm7b5',
  '7sus': '7sus4',
};

/** The names of the twelve roots as the games spell them (flats for the black keys a flat is usual for). */
export const ROOT_NAMES: readonly string[] = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
];

const LETTERS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** A chord read from its name. */
export interface ParsedChord {
  /** The root's pitch class (0 = C). */
  root: number;
  quality: ChordQuality;
  /** The bass note's pitch class for a slash chord such as "G/B", else null. */
  bass: number | null;
}

const NAME = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/;

const pitchClass = (letter: string, accidental: string): number =>
  mod12(LETTERS[letter]! + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0));

/** Reads a chord name ("F#m", "Bbmaj7", "D/F#", "Asus4", "E5"), or null when it is not one. */
export function parseChordName(name: string): ParsedChord | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const ending = m[3]!;
  const id = Object.hasOwn(ALIASES, ending) ? ALIASES[ending]! : ending;
  const quality = CHORD_QUALITIES.find((q) => q.id === id);
  if (!quality) return null;
  return {
    root: pitchClass(m[1]!, m[2]!),
    quality,
    bass: m[4] === undefined ? null : pitchClass(m[4], m[5]!),
  };
}

/** The pitch classes a chord sounds (its bass included), lowest note's class first when it has a bass. */
export function chordPitchClasses(chord: ParsedChord): number[] {
  const notes = chord.quality.intervals.map((i) => mod12(chord.root + i));
  return chord.bass !== null && !notes.includes(chord.bass) ? [chord.bass, ...notes] : notes;
}

/** The name the games use for a chord: a flat or sharp root as in `ROOT_NAMES`, aliases made plain. */
export function canonicalChordName(name: string): string | null {
  const c = parseChordName(name);
  if (!c) return null;
  const bass = c.bass === null ? '' : `/${ROOT_NAMES[c.bass]}`;
  return `${ROOT_NAMES[c.root]}${c.quality.id}${bass}`;
}

/** Every chord the games name (twelve roots by every quality), commonest qualities first. */
export function allChordNames(): string[] {
  return CHORD_QUALITIES.flatMap((q) => ROOT_NAMES.map((r) => `${r}${q.id}`));
}
