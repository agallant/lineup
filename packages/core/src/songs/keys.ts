import { chartFromBeats, type BeatNote, type Chart, type ChartMeta } from '../chart';
import { melodyNotes, parseNoteName } from './notation';

/**
 * Songs and exercises for the keyboard (Keyline): a right-hand melody, often with the left hand
 * underneath, written like a melody (`C4:1 E4:2`). Notes that start together are a chord.
 */

type Meta = Pick<ChartMeta, 'title' | 'bpm'> & Partial<ChartMeta>;

/** A keyboard piece from the right hand's notes and, optionally, the left hand's. */
export function keysChart(meta: Meta, right: string, left?: string): Chart {
  const notes: BeatNote[] = [...melodyNotes(right), ...(left ? melodyNotes(left) : [])].sort(
    (a, b) => a.beat - b.beat || a.pitch! - b.pitch!,
  );
  return chartFromBeats({ ...meta, instruments: ['keyboard'] }, notes);
}

/** Chords one after another from a list of [notes, beats]; the notes of each start together. */
function chordsChart(meta: Meta, parts: readonly (readonly [string, number])[]): Chart {
  const notes: BeatNote[] = [];
  let beat = 0;
  for (const [names, beats] of parts) {
    // a chord rings a little short of its length, like every written note
    for (const name of names.split(' ')) {
      notes.push({ beat, beats: beats * 0.88, pitch: parseNoteName(name) });
    }
    beat += beats;
  }
  return chartFromBeats({ ...meta, instruments: ['keyboard'] }, notes);
}

const PIECES: readonly {
  id: string;
  title: string;
  bpm: number;
  tonic: number;
  right: string;
  left?: string;
}[] = [
  {
    id: 'hands-ode',
    title: 'Ode to Joy, hands together',
    bpm: 92,
    tonic: 60,
    right: `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 |
      E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2`,
    left: `C3:4 | C3:2 G2:2 | C3:2 G2:2 | G2:4 | C3:4 | C3:2 G2:2 | F2:2 G2:2 | G2:2 C3:2`,
  },
  {
    id: 'hands-lullaby',
    title: 'A little lullaby, hands together',
    bpm: 76,
    tonic: 60,
    right: `E4:2 G4:2 | A4:2 G4:2 | E4:2 D4:2 | C4:4 | E4:2 G4:2 | A4:2 C5:2 | G4:4 | G4:4`,
    left: `C3:4 | F2:2 C3:2 | G2:2 C3:2 | C3:4 | C3:4 | F2:2 A2:2 | G2:2 D3:2 | G2:4`,
  },
  {
    id: 'hands-march',
    title: 'Little march in C',
    bpm: 100,
    tonic: 60,
    right: `C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`,
    left: `C3:2 C3:2 | F2:2 C3:2 | D3:2 C3:2 | G2:2 C3:2`,
  },
  {
    id: 'hands-g-waltz',
    title: 'Waltz in G, hands together',
    bpm: 108,
    tonic: 67,
    right: `D5:1 B4:1 G4:1 | A4:1 B4:1 C5:1 | D5:1 B4:1 G4:1 | A4:3 | D5:1 B4:1 G4:1 | C5:1 D5:1 E5:1 | D5:1 C5:1 B4:1 | G4:3`,
    left: `G2:1 D3:1 D3:1 | D3:1 A2:1 A2:1 | G2:1 D3:1 D3:1 | D3:1 A2:1 A2:1 | G2:1 D3:1 D3:1 | C3:1 G3:1 G3:1 | D3:1 A2:1 A2:1 | G2:1 D3:1 D3:1`,
  },
];

const PIECE_SONGS: Record<string, Chart> = Object.fromEntries(
  PIECES.map((p) => [
    `keys-${p.id}`,
    keysChart(
      {
        title: p.title,
        artist: 'Lineup',
        bpm: p.bpm,
        tonic: p.tonic,
        ...(p.id === 'hands-g-waltz' ? { beatsPerBar: 3 } : {}),
      },
      p.right,
      p.left,
    ),
  ]),
);

const chords = (
  id: string,
  title: string,
  bpm: number,
  tonic: number,
  parts: readonly (readonly [string, number])[],
): [string, Chart] => [`keys-${id}`, chordsChart({ title, artist: 'Lineup', bpm, tonic }, parts)];

/** The pieces for the keyboard that are not the shared tunes: hands together, and chords. */
export const KEY_PIECES: Readonly<Record<string, Chart>> = {
  ...PIECE_SONGS,
  ...Object.fromEntries([
    chords('chords-c-f-g', 'Chords: C, F and G', 80, 60, [
      ['C4 E4 G4', 2],
      ['C4 F4 A4', 2],
      ['B3 D4 G4', 2],
      ['C4 E4 G4', 2],
      ['C4 E4 G4', 2],
      ['C4 F4 A4', 2],
      ['B3 D4 G4', 2],
      ['C4 E4 G4', 4],
    ]),
    chords('chords-pop', 'Chords: the pop four (C G Am F)', 88, 60, [
      ['C4 E4 G4', 4],
      ['B3 D4 G4', 4],
      ['C4 E4 A4', 4],
      ['C4 F4 A4', 4],
      ['C4 E4 G4', 4],
      ['B3 D4 G4', 4],
      ['C4 F4 A4', 4],
      ['C4 E4 G4', 4],
    ]),
    chords('chords-minor', 'Chords: A minor, D minor, E', 76, 60, [
      ['A3 C4 E4', 2],
      ['A3 D4 F4', 2],
      ['G#3 B3 E4', 2],
      ['A3 C4 E4', 2],
      ['A3 C4 E4', 2],
      ['A3 D4 F4', 2],
      ['G#3 B3 E4', 2],
      ['A3 C4 E4', 4],
    ]),
  ]),
};

const EXERCISES: readonly {
  id: string;
  title: string;
  bpm: number;
  tonic: number;
  right: string;
  left?: string;
}[] = [
  {
    id: 'keys-ex-five-finger',
    title: 'Five fingers on C, up and down',
    bpm: 72,
    tonic: 60,
    right: `C4 D4 E4 F4 G4 F4 E4 D4 | C4:2 E4:2 G4:2 E4:2 | C4:4`,
  },
  {
    id: 'keys-ex-c-scale',
    title: 'C major scale, one octave',
    bpm: 80,
    tonic: 60,
    right: `C4 D4 E4 F4 G4 A4 B4 C5 | C5 B4 A4 G4 F4 E4 D4 C4 | C4:4`,
  },
  {
    id: 'keys-ex-c-scale-two',
    title: 'C major scale, two octaves',
    bpm: 84,
    tonic: 60,
    right: `C4:.5 D4:.5 E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:.5 D5:.5 E5:.5 F5:.5 G5:.5 A5:.5 B5:.5 C6:1 | C6:.5 B5:.5 A5:.5 G5:.5 F5:.5 E5:.5 D5:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:1`,
  },
  {
    id: 'keys-ex-g-scale',
    title: 'G major scale (one sharp)',
    bpm: 80,
    tonic: 67,
    right: `G4 A4 B4 C5 D5 E5 F#5 G5 | G5 F#5 E5 D5 C5 B4 A4 G4 | G4:4`,
  },
  {
    id: 'keys-ex-arpeggios',
    title: 'Broken chords in C and G',
    bpm: 84,
    tonic: 60,
    right: `C4 E4 G4 C5 G4 E4 C4:2 | B3 D4 G4 B4 G4 D4 B3:2 | C4 E4 G4 C5 G4 E4 C4:2`,
  },
  {
    id: 'keys-ex-hands-apart',
    title: 'Left hand roots, right hand tune',
    bpm: 72,
    tonic: 60,
    right: `E4:2 D4:2 | C4:2 D4:2 | E4:2 E4:2 | E4:4`,
    left: `C3:4 | G2:4 | C3:4 | C3:4`,
  },
  {
    id: 'keys-ex-black-keys',
    title: 'The black keys: F-sharp pentatonic',
    bpm: 80,
    tonic: 66,
    right: `F#4 G#4 A#4 C#5 D#5 C#5 A#4 G#4 | F#4:2 A#4:2 D#5:2 A#4:2 | F#4:4`,
  },
];

/** Practice material for the keyboard: five-finger patterns, scales, broken chords, hands apart. */
export const KEY_EXERCISES: Readonly<Record<string, Chart>> = Object.fromEntries(
  EXERCISES.map((e) => [
    e.id,
    keysChart({ title: e.title, artist: 'Lineup', bpm: e.bpm, tonic: e.tonic }, e.right, e.left),
  ]),
);
