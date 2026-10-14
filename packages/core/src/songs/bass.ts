import { chartFromBeats, type BeatNote, type Chart, type ChartMeta } from '../chart';
import { midiLabel } from '../notes';
import { melodyNotes } from './notation';

/**
 * Songs and exercises for the bass guitar (Bassline): written like a melody, but every note also
 * names the string and fret that sound it, so the game can show them like tab.
 */

/** The open strings of a four-string bass in standard tuning (E1 A1 D2 G2), lowest first. */
export const BASS_OPEN = [28, 33, 38, 43] as const;

/** The highest fret a bass line asks for. */
const MAX_FRET = 12;

/**
 * The fret to hold on each string to play `pitch` (null for strings not played): the lowest fret
 * that reaches it, which for most notes is the lowest string that can play it too.
 */
export function bassPluck(pitch: number): (number | null)[] {
  let best = -1;
  let bestFret = Infinity;
  BASS_OPEN.forEach((open, i) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= MAX_FRET && fret < bestFret) {
      best = i;
      bestFret = fret;
    }
  });
  if (best < 0) throw new Error(`MIDI ${pitch} is not on the bass below fret ${MAX_FRET}`);
  return BASS_OPEN.map((_, i) => (i === best ? bestFret : null));
}

/** True when `pitch` can be played on the bass within the first twelve frets. */
export const bassPlayable = (pitch: number): boolean =>
  BASS_OPEN.some((open) => pitch - open >= 0 && pitch - open <= MAX_FRET);

type Meta = Pick<ChartMeta, 'title' | 'bpm'> & Partial<ChartMeta>;

/** A bass line from melody notation (`E1:1 A1:.5 r:.5`), each note with its string and fret. */
export function bassChart(meta: Meta, text: string): Chart {
  const notes: BeatNote[] = melodyNotes(text).map((n) => ({
    ...n,
    expected: { frets: bassPluck(n.pitch!) },
  }));
  return chartFromBeats({ ...meta, instruments: ['bass'] }, notes);
}

// ------------------------------------------------------------------------------- generated lines

/** One bar of a pattern: [semitones above the chord root, or null for a rest, beats]. */
type Bar = readonly (readonly [number | null, number])[];

/** The bar patterns, by how the line is played. Each fills four beats. */
const PATTERNS: Readonly<Record<string, { label: string; major: Bar; minor?: Bar }>> = {
  roots: { label: 'whole notes on the roots', major: [[0, 4]] },
  quarters: {
    label: 'quarter notes on the roots',
    major: [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 1],
    ],
  },
  eighths: {
    label: 'driving eighths',
    major: Array.from({ length: 8 }, () => [0, 0.5] as const),
  },
  'root-fifth': {
    label: 'root and fifth',
    major: [
      [0, 1],
      [0, 1],
      [7, 1],
      [0, 1],
    ],
  },
  disco: {
    label: 'octaves, disco style',
    major: Array.from({ length: 8 }, (_, i) => [i % 2 === 0 ? 0 : 12, 0.5] as const),
  },
  walking: {
    label: 'walking line',
    major: [
      [0, 1],
      [4, 1],
      [7, 1],
      [9, 1],
    ],
    minor: [
      [0, 1],
      [3, 1],
      [7, 1],
      [5, 1],
    ],
  },
  funk: {
    label: 'funk groove',
    major: [
      [0, 0.5],
      [null, 0.5],
      [0, 0.5],
      [12, 0.5],
      [null, 0.5],
      [10, 0.5],
      [7, 1],
    ],
  },
};

type PatternId = keyof typeof PATTERNS;

/** A chord progression as roots (MIDI) with whether each chord is minor. */
interface Chord {
  root: number;
  minor?: boolean;
}

/** Writes a progression, one bar a chord, in a pattern, as melody notation. */
function lineFor(chords: readonly Chord[], pattern: PatternId): string {
  const def = PATTERNS[pattern]!;
  return chords
    .map((c) => {
      const bar = (c.minor && def.minor) || def.major;
      return bar
        .map(([offset, beats]) =>
          offset === null ? `r:${beats}` : `${midiLabel(c.root + offset)}:${beats}`,
        )
        .join(' ');
    })
    .join(' | ');
}

/** A key's chord roots by degree, in the octave that keeps every line on the bass. */
interface KeyDef {
  name: string;
  /** Pitch class of the key note. */
  pc: number;
  /** Roots (MIDI) of I, IV, V, vi (or the minor equivalents) placed low on the neck. */
  I: number;
  IV: number;
  V: number;
  vi: number;
}

const KEYS: readonly KeyDef[] = [
  { name: 'E', pc: 4, I: 28, IV: 33, V: 35, vi: 37 },
  { name: 'A', pc: 9, I: 33, IV: 38, V: 40, vi: 42 },
  { name: 'G', pc: 7, I: 31, IV: 36, V: 38, vi: 40 },
  { name: 'D', pc: 2, I: 38, IV: 31, V: 33, vi: 35 },
  { name: 'C', pc: 0, I: 36, IV: 29, V: 31, vi: 33 },
];

/** Songs by pattern and key: tempo and how hard the pattern is (for ordering in the menu). */
const BLUES = (k: KeyDef): Chord[] => [
  { root: k.I },
  { root: k.I },
  { root: k.I },
  { root: k.I },
  { root: k.IV },
  { root: k.IV },
  { root: k.I },
  { root: k.I },
  { root: k.V },
  { root: k.IV },
  { root: k.I },
  { root: k.V },
];
const POP = (k: KeyDef): Chord[] => [
  { root: k.I },
  { root: k.V },
  { root: k.vi, minor: true },
  { root: k.IV },
  { root: k.I },
  { root: k.V },
  { root: k.vi, minor: true },
  { root: k.IV },
];
const ROCK = (k: KeyDef): Chord[] => [
  { root: k.I },
  { root: k.I },
  { root: k.IV },
  { root: k.I },
  { root: k.I },
  { root: k.I },
  { root: k.V },
  { root: k.IV },
];

interface Plan {
  slug: string;
  title: (k: KeyDef, p: string) => string;
  chords: (k: KeyDef) => Chord[];
  keys: readonly string[];
  patterns: readonly { id: PatternId; bpm: number }[];
}

const PLANS: readonly Plan[] = [
  {
    slug: 'blues',
    title: (k, p) => `12-bar blues in ${k.name}: ${p}`,
    chords: BLUES,
    keys: ['E', 'A', 'G'],
    patterns: [
      { id: 'roots', bpm: 84 },
      { id: 'quarters', bpm: 88 },
      { id: 'walking', bpm: 92 },
    ],
  },
  {
    slug: 'pop',
    title: (k, p) => `Pop four chords in ${k.name}: ${p}`,
    chords: POP,
    keys: ['C', 'G', 'D'],
    patterns: [
      { id: 'roots', bpm: 90 },
      { id: 'eighths', bpm: 96 },
      { id: 'root-fifth', bpm: 96 },
    ],
  },
  {
    slug: 'rock',
    title: (k, p) => `Rock in ${k.name}: ${p}`,
    chords: ROCK,
    keys: ['E', 'A', 'D'],
    patterns: [
      { id: 'eighths', bpm: 104 },
      { id: 'disco', bpm: 100 },
      { id: 'funk', bpm: 96 },
    ],
  },
];

function buildGenerated(): Record<string, Chart> {
  const out: Record<string, Chart> = {};
  for (const plan of PLANS) {
    for (const keyName of plan.keys) {
      const k = KEYS.find((x) => x.name === keyName)!;
      for (const { id, bpm } of plan.patterns) {
        const text = lineFor(plan.chords(k), id);
        // the tonic of the major key holding the notes (any octave), for the rating
        out[`bass-${plan.slug}-${k.name.toLowerCase()}-${id}`] = bassChart(
          {
            title: plan.title(k, PATTERNS[id]!.label),
            artist: 'Lineup',
            bpm,
            tonic: 60 + k.pc,
          },
          text,
        );
      }
    }
  }
  return out;
}

// ----------------------------------------------------------------------------------------- hand-written

const HAND: readonly { id: string; title: string; bpm: number; tonic: number; notes: string }[] = [
  {
    id: 'bass-simple-rock',
    title: 'Simple rock in A',
    bpm: 96,
    tonic: 69,
    notes: `A1:1 A1:1 A1:1 A1:1 | A1:1 A1:1 D2:1 D2:1 | A1:1 A1:1 A1:1 A1:1 | E2:1 E2:1 D2:1 A1:1 |
      A1:1 A1:1 A1:1 A1:1 | A1:1 A1:1 D2:1 D2:1 | A1:2 E2:2 | A1:4`,
  },
  {
    id: 'bass-minor-groove',
    title: 'Minor groove in E',
    bpm: 88,
    tonic: 67,
    notes: `E1:1 E1:.5 G1:.5 E1:1 D2:1 | E1:1 E1:.5 G1:.5 E1:1 B1:1 | A1:1 A1:.5 C2:.5 A1:1 G1:1 | B1:1 B1:.5 D2:.5 B1:1 E1:1`,
  },
  {
    id: 'bass-bouncing-fifths',
    title: 'Bouncing fifths in C',
    bpm: 100,
    tonic: 60,
    notes: `C2:.5 G2:.5 C2:.5 G2:.5 C2:.5 G2:.5 C2:.5 G2:.5 | F1:.5 C2:.5 F1:.5 C2:.5 F1:.5 C2:.5 F1:.5 C2:.5 |
      G1:.5 D2:.5 G1:.5 D2:.5 G1:.5 D2:.5 G1:.5 D2:.5 | C2:2 G1:2`,
  },
  {
    id: 'bass-octave-leaps',
    title: 'Octave leaps in D',
    bpm: 108,
    tonic: 62,
    notes: `D2:.5 D3:.5 D2:.5 D3:.5 D2:.5 D3:.5 D2:.5 D3:.5 | G1:.5 G2:.5 G1:.5 G2:.5 G1:.5 G2:.5 G1:.5 G2:.5 |
      A1:.5 A2:.5 A1:.5 A2:.5 A1:.5 A2:.5 A1:.5 A2:.5 | D2:4`,
  },
];

const HAND_SONGS: Record<string, Chart> = Object.fromEntries(
  HAND.map((h) => [
    h.id,
    bassChart({ title: h.title, artist: 'Lineup', bpm: h.bpm, tonic: h.tonic }, h.notes),
  ]),
);

/** The bass songs: generated lines over blues, pop and rock progressions in several keys, and a few written by hand. */
export const BASS_SONGS: Readonly<Record<string, Chart>> = { ...HAND_SONGS, ...buildGenerated() };

// ----------------------------------------------------------------------------------------- exercises

const EXERCISES: readonly {
  id: string;
  title: string;
  bpm: number;
  tonic: number;
  notes: string;
}[] = [
  {
    id: 'bass-ex-open-strings',
    title: 'Open strings: E A D G',
    bpm: 60,
    tonic: 64,
    notes: `E1:2 A1:2 D2:2 G2:2 | G2:2 D2:2 A1:2 E1:2`,
  },
  {
    id: 'bass-ex-fret-by-fret',
    title: 'One finger a fret, on the E string',
    bpm: 72,
    tonic: 64,
    notes: `E1:1 F1:1 F#1:1 G1:1 | G1:1 F#1:1 F1:1 E1:1 | G#1:1 A1:1 A#1:1 B1:1 | B1:1 A#1:1 A1:1 G#1:1`,
  },
  {
    id: 'bass-ex-root-fifth',
    title: 'Root and fifth on every string',
    bpm: 76,
    tonic: 64,
    notes: `E1:1 B1:1 E1:1 B1:1 | A1:1 E2:1 A1:1 E2:1 | D2:1 A2:1 D2:1 A2:1 | G2:1 D3:1 G2:1 D3:1`,
  },
  {
    id: 'bass-ex-e-minor-pentatonic',
    title: 'E minor pentatonic',
    bpm: 80,
    tonic: 67,
    notes: `E1:1 G1:1 A1:1 B1:1 | D2:1 E2:1 D2:1 B1:1 | A1:1 G1:1 E1:2`,
  },
  {
    id: 'bass-ex-a-minor-pentatonic',
    title: 'A minor pentatonic',
    bpm: 80,
    tonic: 72,
    notes: `A1:1 C2:1 D2:1 E2:1 | G2:1 A2:1 G2:1 E2:1 | D2:1 C2:1 A1:2`,
  },
  {
    id: 'bass-ex-g-major-scale',
    title: 'G major scale across the neck',
    bpm: 80,
    tonic: 67,
    notes: `G1:1 A1:1 B1:1 C2:1 | D2:1 E2:1 F#2:1 G2:1 | G2:1 F#2:1 E2:1 D2:1 | C2:1 B1:1 A1:1 G1:1`,
  },
  {
    id: 'bass-ex-eighths',
    title: 'Steady eighths on one note',
    bpm: 84,
    tonic: 64,
    notes: `A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 | A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 A1:.5 | D2:.5 D2:.5 D2:.5 D2:.5 D2:.5 D2:.5 D2:.5 D2:.5 | E2:.5 E2:.5 E2:.5 E2:.5 E2:.5 E2:.5 E2:.5 E2:.5`,
  },
  {
    id: 'bass-ex-string-crossing',
    title: 'String crossing: E, A, D, G and back',
    bpm: 84,
    tonic: 64,
    notes: `E1:.5 A1:.5 D2:.5 G2:.5 G2:.5 D2:.5 A1:.5 E1:.5 | G1:.5 C2:.5 F2:.5 A#2:.5 A#2:.5 F2:.5 C2:.5 G1:.5`,
  },
];

/** Practice material for the bass: open strings, scales and patterns, filed as exercises in the menu. */
export const BASS_EXERCISES: Readonly<Record<string, Chart>> = Object.fromEntries(
  EXERCISES.map((e) => [
    e.id,
    bassChart({ title: e.title, artist: 'Lineup', bpm: e.bpm, tonic: e.tonic }, e.notes),
  ]),
);
