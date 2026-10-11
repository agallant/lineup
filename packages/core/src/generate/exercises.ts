import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { pluckNotes, ukulelePlayable } from '../songs/notation';
import { SCALES, degreeToMidi, type ScaleId } from './theory';

/** The kinds of practice pattern, each a sequence of scale degrees. */
export type ExerciseKindId =
  | 'up-down'
  | 'thirds'
  | 'patterns'
  | 'arpeggios'
  | 'long-tones'
  | 'ladder'
  | 'fourths'
  | 'fifths'
  | 'octaves';

interface Step {
  /** Scale degree: 0 is the root, `n` (the scale's length) the octave above. */
  degree: number;
  beats: number;
}

interface ExerciseKind {
  id: ExerciseKindId;
  label: string;
  bpm: number;
  /** The notes of the pattern for a scale of `n` degrees per octave. */
  steps(n: number): Step[];
}

const one = (degrees: readonly number[], beats = 1): Step[] =>
  degrees.map((degree) => ({ degree, beats }));

/** The last note of a pattern is held, so it ends like a phrase rather than stopping. */
const holdLast = (steps: Step[]): Step[] =>
  steps.map((s, i) => (i === steps.length - 1 ? { ...s, beats: Math.max(s.beats, 2) } : s));

/** The practice patterns by id, each with a label, tempo and its sequence of scale degrees. */
export const EXERCISE_KINDS: Readonly<Record<ExerciseKindId, ExerciseKind>> = {
  'up-down': {
    id: 'up-down',
    label: 'up and down',
    bpm: 80,
    steps: (n) =>
      holdLast(
        one([
          ...Array.from({ length: n + 1 }, (_, i) => i),
          ...Array.from({ length: n }, (_, i) => n - 1 - i),
        ]),
      ),
  },
  thirds: {
    id: 'thirds',
    label: 'in thirds',
    bpm: 80,
    steps: (n) => {
      const degrees: number[] = [];
      for (let i = 0; i + 2 <= n; i++) degrees.push(i, i + 2);
      return holdLast(one(degrees));
    },
  },
  patterns: {
    id: 'patterns',
    label: '1-2-3-1 patterns',
    bpm: 84,
    steps: (n) => {
      const degrees: number[] = [];
      for (let i = 0; i + 2 <= n; i++) degrees.push(i, i + 1, i + 2, i);
      return holdLast(one(degrees));
    },
  },
  arpeggios: {
    id: 'arpeggios',
    label: 'arpeggios (I IV V I)',
    bpm: 72,
    // stacked thirds on degrees 1, 4 and 5 of a seven-note scale
    steps: () => holdLast(one([0, 2, 4, 7, 4, 2, 0, 3, 5, 7, 5, 3, 4, 6, 8, 6, 4, 0, 2, 4, 2, 0])),
  },
  'long-tones': {
    id: 'long-tones',
    label: 'long tones',
    bpm: 60,
    steps: () => one([0, 2, 4, 7, 4, 2, 0], 4),
  },
  ladder: {
    id: 'ladder',
    label: 'interval ladder',
    bpm: 76,
    steps: (n) => {
      const degrees: number[] = [];
      for (let i = 1; i <= n; i++) degrees.push(0, i);
      return holdLast(one(degrees));
    },
  },
  fourths: {
    id: 'fourths',
    label: 'in fourths',
    bpm: 76,
    steps: (n) => {
      const degrees: number[] = [];
      for (let i = 0; i + 3 <= n; i++) degrees.push(i, i + 3);
      return holdLast(one(degrees));
    },
  },
  fifths: {
    id: 'fifths',
    label: 'in fifths',
    bpm: 72,
    steps: (n) => {
      const degrees: number[] = [];
      for (let i = 0; i + 4 <= n; i++) degrees.push(i, i + 4);
      return holdLast(one(degrees));
    },
  },
  octaves: {
    id: 'octaves',
    label: 'octave leaps',
    bpm: 68,
    // the root and the octave above, then from each of the next degrees, a big leap every time
    steps: (n) => holdLast(one([0, n, 0, n, 1, n + 1, 1, n + 1, 2, n + 2, 2, n + 2, 0])),
  },
};

/** What each scale practises: every scale gets the up-and-down run; the major scale gets them all. */
const PLAN: readonly { scale: ScaleId; kinds: readonly ExerciseKindId[] }[] = [
  {
    scale: 'major',
    kinds: [
      'up-down',
      'thirds',
      'patterns',
      'arpeggios',
      'long-tones',
      'ladder',
      'fourths',
      'fifths',
      'octaves',
    ],
  },
  { scale: 'minor', kinds: ['up-down', 'thirds', 'patterns', 'fifths'] },
  { scale: 'dorian', kinds: ['up-down', 'thirds'] },
  { scale: 'mixolydian', kinds: ['up-down'] },
  { scale: 'major-pentatonic', kinds: ['up-down'] },
  { scale: 'minor-pentatonic', kinds: ['up-down'] },
];

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/**
 * The tonic of the major key the exercises are written in, per instrument profile. Voice sits
 * around middle C; winds an octave up, where whistles and recorders sound.
 */
export const EXERCISE_TONICS: Readonly<Record<string, number>> = {
  voice: 60,
  wind: 72,
  'ukulele-strum': 60,
};

/** Profiles whose exercises and melodies are plucked on single strings rather than sounded. */
export const isPicked = (profileId: string): boolean => profileId === 'ukulele-strum';

/** The chromatic scale up one octave and back, every semitone: it needs the cross-fingerings. */
function chromaticExercise(profileId: string, tonic: number): Chart {
  const semis = [
    ...Array.from({ length: 13 }, (_, i) => i),
    ...Array.from({ length: 12 }, (_, i) => 11 - i),
  ];
  const steps = semis.map((s) => ({ s, beats: 1 }));
  steps[steps.length - 1]!.beats = 2;
  let beat = 0;
  const notes: BeatNote[] = steps.map(({ s, beats }) => {
    const note: BeatNote = { beat, beats: beats * 0.88, pitch: tonic + s };
    beat += beats;
    return note;
  });
  return chartFromBeats(
    {
      title: 'Chromatic scale: up and down',
      artist: 'Lineup',
      bpm: 66,
      instruments: [profileId],
      tonic,
    },
    isPicked(profileId) ? pluckNotes(notes) : notes,
  );
}

/**
 * Finding a voice's range: whole tones from a fourth below the tonic up to the tonic's octave and a
 * sixth, each held for two beats, then back down. Stop where it gets hard: that is the edge of the
 * range. The whole-tone steps are not all in one major key, so it is rated chromatic.
 */
function rangeFinder(tonic: number): Chart {
  const up = Array.from({ length: 12 }, (_, i) => -5 + 2 * i); // -5 .. 17
  const semis = [...up, ...up.slice(0, -1).reverse()];
  const notes: BeatNote[] = semis.map((s, i) => ({
    beat: i * 2,
    beats: 2 * 0.88,
    pitch: tonic + s,
  }));
  return chartFromBeats(
    {
      title: 'Find your range: whole tones, low to high and back',
      artist: 'Lineup',
      bpm: 60,
      instruments: ['voice'],
      tonic,
    },
    notes,
  );
}

/** The exercises written for one instrument profile, keyed by song id (`ex-<profile>-<scale>-<kind>`). */
export function exerciseCharts(profileId: string): Record<string, Chart> {
  const parentTonic = EXERCISE_TONICS[profileId];
  if (parentTonic === undefined) return {};
  const out: Record<string, Chart> = {};
  for (const { scale: scaleId, kinds } of PLAN) {
    const scale = SCALES[scaleId];
    // a whistle or recorder cannot play below its tonic, so a mode starts at or above it there;
    // a voice can sit below
    const root =
      parentTonic + (profileId === 'wind' ? mod12(scale.rootFromParent) : scale.rootFromParent);
    for (const kindId of kinds) {
      const kind = EXERCISE_KINDS[kindId];
      let beat = 0;
      const notes: BeatNote[] = kind.steps(scale.steps.length).map((s) => {
        const note: BeatNote = {
          beat,
          beats: s.beats * 0.88,
          pitch: degreeToMidi(scale, root, s.degree),
        };
        beat += s.beats;
        return note;
      });
      // a ukulele plays a note on one string, so only runs that stay on the first frets are offered
      if (isPicked(profileId) && !notes.every((n) => ukulelePlayable(n.pitch!))) continue;
      out[`ex-${profileId}-${scaleId}-${kindId}`] = chartFromBeats(
        {
          title: `${scale.label}: ${kind.label}`,
          artist: 'Lineup',
          bpm: kind.bpm,
          instruments: [profileId],
          // the major scale holding the same notes, so a diatonic instrument can play it in its key
          tonic: parentTonic,
        },
        isPicked(profileId) ? pluckNotes(notes) : notes,
      );
    }
  }
  out[`ex-${profileId}-chromatic-up-down`] = chromaticExercise(profileId, parentTonic);
  if (profileId === 'voice') out['ex-voice-range-finder'] = rangeFinder(parentTonic);
  return out;
}

/** Pairs of chords worth practising changes between, easiest first. */
const CHANGE_PAIRS: readonly (readonly [string, string])[] = [
  ['C', 'Am'],
  ['C', 'F'],
  ['C', 'G'],
  ['G', 'D'],
  ['Am', 'F'],
  ['G', 'Em'],
  ['D', 'A'],
  ['Dm', 'G7'],
];

/**
 * Chord-change drills for the ukulele: two chords alternating, with the changes coming faster as
 * the drill goes on (every four beats, then two, then every beat), one down-stroke a beat. The
 * ids are `ex-ukulele-strum-changes-<a>-<b>`.
 */
export function chordChangeDrills(): Record<string, Chart> {
  const out: Record<string, Chart> = {};
  for (const [a, b] of CHANGE_PAIRS) {
    const notes: BeatNote[] = [];
    let beat = 0;
    let which = 0;
    // changes every 4 beats (4 holds), every 2 beats (8 holds), then every beat (8 holds)
    for (const [hold, count] of [
      [4, 4],
      [2, 8],
      [1, 8],
    ] as const) {
      for (let i = 0; i < count; i++, which++) {
        const chord = which % 2 === 0 ? a : b;
        for (let k = 0; k < hold; k++, beat++) {
          notes.push({ beat, lane: 'down', expected: { chord, direction: 'down' } });
        }
      }
      which = 0; // each speed starts again on the first chord
    }
    out[`ex-ukulele-strum-changes-${a.toLowerCase()}-${b.toLowerCase()}`] = chartFromBeats(
      {
        title: `Chord changes: ${a} and ${b}`,
        artist: 'Lineup',
        bpm: 72,
        instruments: ['ukulele-strum'],
      },
      notes,
    );
  }
  return out;
}
