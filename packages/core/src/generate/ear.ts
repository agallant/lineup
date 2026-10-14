import { createRng, pick, type Rng } from './random';

/**
 * The ear-training exercises: name an interval, the kind of chord, or which note of the key a note
 * is (after hearing the key, like singing do-re-mi by ear).
 */
export type EarKind = 'intervals' | 'chords' | 'degrees';

export const EAR_KINDS: readonly EarKind[] = ['intervals', 'chords', 'degrees'];

export type EarLevel = 'easy' | 'medium' | 'hard';

export const EAR_LEVELS: readonly EarLevel[] = ['easy', 'medium', 'hard'];

export const isEarKind = (v: unknown): v is EarKind =>
  typeof v === 'string' && (EAR_KINDS as readonly string[]).includes(v);

export const isEarLevel = (v: unknown): v is EarLevel =>
  typeof v === 'string' && (EAR_LEVELS as readonly string[]).includes(v);

/** What each kind is called in a menu. */
export const EAR_LABELS: Readonly<Record<EarKind, string>> = {
  intervals: 'Intervals: how far apart are two notes?',
  chords: 'Chords: major, minor and friends',
  degrees: 'Name that note: which note of the key? (do, re, mi...)',
};

/** The notes of the major scale by their solfège names and semitones above the key note. */
const DEGREES: readonly { name: string; semitones: number }[] = [
  { name: 'Do', semitones: 0 },
  { name: 'Re', semitones: 2 },
  { name: 'Mi', semitones: 4 },
  { name: 'Fa', semitones: 5 },
  { name: 'Sol', semitones: 7 },
  { name: 'La', semitones: 9 },
  { name: 'Ti', semitones: 11 },
];

const DEGREE_POOL: Readonly<Record<EarLevel, readonly string[]>> = {
  easy: ['Do', 'Mi', 'Sol'],
  medium: ['Do', 'Re', 'Mi', 'Sol', 'La'],
  hard: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Ti'],
};

/** An interval by its size in semitones. */
const INTERVALS: readonly { name: string; semitones: number }[] = [
  { name: 'Unison', semitones: 0 },
  { name: 'Minor 2nd', semitones: 1 },
  { name: 'Major 2nd', semitones: 2 },
  { name: 'Minor 3rd', semitones: 3 },
  { name: 'Major 3rd', semitones: 4 },
  { name: 'Perfect 4th', semitones: 5 },
  { name: 'Tritone', semitones: 6 },
  { name: 'Perfect 5th', semitones: 7 },
  { name: 'Minor 6th', semitones: 8 },
  { name: 'Major 6th', semitones: 9 },
  { name: 'Minor 7th', semitones: 10 },
  { name: 'Major 7th', semitones: 11 },
  { name: 'Octave', semitones: 12 },
];

/** The intervals asked at each level: wide and distinct first, then all of them. */
const INTERVAL_POOL: Readonly<Record<EarLevel, readonly number[]>> = {
  easy: [3, 4, 5, 7, 12],
  medium: [2, 3, 4, 5, 7, 9, 12],
  hard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

/** A chord quality by the semitones above its root. */
const CHORDS: readonly { name: string; steps: readonly number[] }[] = [
  { name: 'Major', steps: [0, 4, 7] },
  { name: 'Minor', steps: [0, 3, 7] },
  { name: 'Diminished', steps: [0, 3, 6] },
  { name: 'Augmented', steps: [0, 4, 8] },
  { name: 'Dominant 7th', steps: [0, 4, 7, 10] },
  { name: 'Major 7th', steps: [0, 4, 7, 11] },
];

const CHORD_POOL: Readonly<Record<EarLevel, readonly string[]>> = {
  easy: ['Major', 'Minor'],
  medium: ['Major', 'Minor', 'Dominant 7th'],
  hard: ['Major', 'Minor', 'Diminished', 'Augmented', 'Dominant 7th', 'Major 7th'],
};

/** One question: what to play, how to play it, the choices and the right one. */
export interface EarQuestion {
  kind: EarKind;
  /** MIDI notes. */
  notes: number[];
  /** Play the notes one after another (an interval), or all together (a chord). */
  together: boolean;
  /** Notes played first to set the key (a name-that-note question), then a pause. */
  lead?: number[];
  /** The names to choose from, in a steady order. */
  choices: string[];
  answer: string;
}

/** The names a level offers for a kind, in a steady order. */
export function earChoices(kind: EarKind, level: EarLevel): string[] {
  if (kind === 'intervals') {
    return INTERVAL_POOL[level].map((s) => INTERVALS.find((i) => i.semitones === s)!.name);
  }
  return kind === 'degrees' ? [...DEGREE_POOL[level]] : [...CHORD_POOL[level]];
}

/** The next question, not the same answer twice in a row. */
export function earQuestion(
  kind: EarKind,
  level: EarLevel,
  rng: Rng,
  previousAnswer?: string,
): EarQuestion {
  const choices = earChoices(kind, level);
  let answer = pick(rng, choices);
  if (answer === previousAnswer && choices.length > 1) {
    answer =
      choices[
        (choices.indexOf(answer) + 1 + Math.floor(rng() * (choices.length - 1))) % choices.length
      ]!;
  }
  // roots between G3 and F4, so everything stays comfortable to hear
  const root = 55 + Math.floor(rng() * 12);
  if (kind === 'intervals') {
    const semitones = INTERVALS.find((i) => i.name === answer)!.semitones;
    // a rising interval most of the time, a falling one now and then at the harder levels
    const falling = level !== 'easy' && rng() < 0.25;
    const notes = falling ? [root + semitones, root] : [root, root + semitones];
    return { kind, notes, together: false, choices, answer };
  }
  if (kind === 'degrees') {
    const semitones = DEGREES.find((d) => d.name === answer)!.semitones;
    // the key is set by its arpeggio (do, mi, sol, do), then one note of the scale is asked
    const lead = [root, root + 4, root + 7, root + 12];
    return { kind, notes: [root + semitones], together: false, lead, choices, answer };
  }
  const chord = CHORDS.find((c) => c.name === answer)!;
  return { kind, notes: chord.steps.map((s) => root + s), together: true, choices, answer };
}

/** A round of questions for a seed: the same seed always asks the same ones. */
export function earRound(kind: EarKind, level: EarLevel, seed: number, length = 10): EarQuestion[] {
  const rng = createRng(seed);
  const out: EarQuestion[] = [];
  for (let i = 0; i < length; i++) out.push(earQuestion(kind, level, rng, out.at(-1)?.answer));
  return out;
}

/** The id a round is filed under on the scoreboard: `ear-<kind>-<level>`. */
export const earId = (kind: EarKind, level: EarLevel): string => `ear-${kind}-${level}`;

/** The title of a round from its id, or null if it is not one. */
export function earTitle(id: string): string | null {
  const m = /^ear-(intervals|chords|degrees)-(easy|medium|hard)$/.exec(id);
  if (!m) return null;
  const level = m[2]!;
  return `Ear training: ${m[1]}, ${level}`;
}

/** How hard each level counts as, for XP (1 to 10). */
export const EAR_RATING: Readonly<Record<EarLevel, number>> = { easy: 3, medium: 5, hard: 8 };
