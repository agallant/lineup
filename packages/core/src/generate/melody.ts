import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { createRng, pick, pickWeighted, type Rng } from './random';
import { SCALES, SCALE_IDS, degreeToMidi, type ScaleDef, type ScaleId } from './theory';
import { EXERCISE_TONICS } from './exercises';

/** How demanding a generated melody is. */
export type MelodyLevel = 'easy' | 'medium' | 'hard';

export const MELODY_LEVELS: readonly MelodyLevel[] = ['easy', 'medium', 'hard'];

export const isMelodyLevel = (v: unknown): v is MelodyLevel =>
  typeof v === 'string' && (MELODY_LEVELS as readonly string[]).includes(v);

export const isScaleId = (v: unknown): v is ScaleId =>
  typeof v === 'string' && (SCALE_IDS as readonly string[]).includes(v);

export interface MelodySpec {
  seed: number;
  scale: ScaleId;
  level: MelodyLevel;
}

/** Seeds are small whole numbers so they are easy to read out and type in. */
export const MAX_SEED = 99999;

interface LevelDef {
  bpm: number;
  /** Eight-beat rhythms, each ending on a note of at least two beats (the phrase's rest). */
  rhythms: readonly (readonly number[])[];
  /** Motion in scale degrees and how often each occurs: the weight is the melody's character. */
  moves: readonly { by: number; weight: number }[];
  /** The largest jump between neighbouring notes, in degrees. */
  maxLeap: number;
  /** The phrase forms the level draws from (letters repeat; a repeated letter is the same phrase). */
  forms: readonly string[];
}

const LEVELS: Readonly<Record<MelodyLevel, LevelDef>> = {
  easy: {
    bpm: 72,
    rhythms: [
      [2, 1, 1, 1, 1, 2],
      [1, 1, 2, 1, 1, 2],
      [1, 1, 1, 1, 2, 2],
      [2, 2, 1, 1, 2],
    ],
    moves: [
      { by: 1, weight: 80 },
      { by: 2, weight: 20 },
    ],
    maxLeap: 2,
    forms: ['AABA'],
  },
  medium: {
    bpm: 80,
    rhythms: [
      [1, 1, 1, 1, 1, 0.5, 0.5, 2],
      [1.5, 0.5, 1, 1, 1, 1, 2],
      [1, 1, 2, 0.5, 0.5, 1, 2],
      [1, 1, 1, 1, 2, 2],
    ],
    moves: [
      { by: 0, weight: 5 },
      { by: 1, weight: 60 },
      { by: 2, weight: 25 },
      { by: 3, weight: 10 },
    ],
    maxLeap: 3,
    forms: ['AABA', 'ABAB'],
  },
  hard: {
    bpm: 92,
    rhythms: [
      [0.5, 0.5, 1, 0.5, 0.5, 1, 1, 1, 2],
      [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 1, 2],
      [1.5, 0.5, 1, 1, 0.5, 0.5, 1, 2],
      [1, 1, 0.5, 0.5, 1, 1, 1, 2],
    ],
    moves: [
      { by: 0, weight: 5 },
      { by: 1, weight: 45 },
      { by: 2, weight: 25 },
      { by: 3, weight: 15 },
      { by: 4, weight: 10 },
    ],
    maxLeap: 4,
    forms: ['ABAC', 'AABA'],
  },
};

/** The scale degrees (indexes) that belong to the tonic chord: root, third and fifth. */
export function chordDegrees(scale: ScaleDef): number[] {
  return scale.steps.flatMap((s, i) => (s === 0 || s === 3 || s === 4 || s === 7 ? [i] : []));
}

const degreeOfStep = (scale: ScaleDef, semitones: number): number => {
  const i = scale.steps.indexOf(semitones);
  return i < 0 ? 0 : i;
};

const BEATS_PER_PHRASE = 8;
const BEATS_PER_BAR = 4;

interface PhraseNote {
  degree: number;
  start: number;
  beats: number;
}

/** True when `degree` (any octave) is a note of the tonic chord. */
const isChordTone = (degree: number, n: number, chord: readonly number[]): boolean =>
  chord.includes(((degree % n) + n) % n);

/**
 * One phrase: a rhythm from the level's table and a walk over the scale. The walk moves mostly by
 * step, answers every big jump by stepping back the other way, lands on a chord tone at the start
 * of each bar, and stays within [lo, hi]. It finishes on `endDegree`.
 */
function makePhrase(
  rng: Rng,
  scale: ScaleDef,
  level: LevelDef,
  from: number,
  endDegree: number,
  lo: number,
  hi: number,
): PhraseNote[] {
  const n = scale.steps.length;
  const chord = chordDegrees(scale);
  const rhythm = pick(rng, level.rhythms);
  let start = 0;
  const notes: PhraseNote[] = rhythm.map((beats) => {
    const note = { degree: 0, start, beats };
    start += beats;
    return note;
  });

  // the first note: the chord tone nearest where the last phrase ended
  let best = lo;
  let bestDist = Infinity;
  for (let d = lo; d <= hi; d++) {
    if (isChordTone(d, n, chord) && Math.abs(d - from) < bestDist) {
      best = d;
      bestDist = Math.abs(d - from);
    }
  }
  notes[0]!.degree = best;

  let lastMove = 0;
  for (let i = 1; i < notes.length; i++) {
    const prev = notes[i - 1]!.degree;
    const strong = notes[i]!.start % BEATS_PER_BAR === 0;
    // after a leap, step back the other way
    const mustRecover = Math.abs(lastMove) >= 3;
    const candidates: { degree: number; weight: number }[] = [];
    for (const { by, weight } of level.moves) {
      if (mustRecover && by !== 1) continue;
      for (const sign of by === 0 ? [1] : [1, -1]) {
        if (mustRecover && Math.sign(lastMove) === sign) continue;
        const degree = prev + sign * by;
        if (degree < lo || degree > hi) continue;
        if (strong && !isChordTone(degree, n, chord)) continue;
        // lean back toward the middle of the range so the line arches instead of drifting
        const mid = (lo + hi) / 2;
        const toward = Math.abs(degree - mid) < Math.abs(prev - mid) ? 1.5 : 1;
        candidates.push({ degree, weight: weight * toward });
      }
    }
    // a bar start with no chord tone in reach: take the nearest one within the leap limit
    const degree = candidates.length
      ? pickWeighted(
          rng,
          candidates.map((c) => ({ item: c.degree, weight: c.weight })),
        )
      : nearestChordTone(prev, n, chord, lo, hi, level.maxLeap);
    notes[i]!.degree = degree;
    lastMove = degree - prev;
  }
  return setEnd(notes, endDegree, level.maxLeap, lo, hi, n);
}

function nearestChordTone(
  from: number,
  n: number,
  chord: readonly number[],
  lo: number,
  hi: number,
  maxLeap: number,
): number {
  let best = from;
  let bestDist = Infinity;
  for (let d = lo; d <= hi; d++) {
    const dist = Math.abs(d - from);
    if (dist <= maxLeap && isChordTone(d, n, chord) && dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Makes the phrase finish on `endDegree` (in whichever octave is nearest and in range), then walks
 * back from the end moving any note that would leave a jump over `maxLeap`.
 */
function setEnd(
  notes: PhraseNote[],
  endDegree: number,
  maxLeap: number,
  lo: number,
  hi: number,
  n: number,
): PhraseNote[] {
  const out = notes.map((x) => ({ ...x }));
  const last = out[out.length - 1]!;
  const before = out.length > 1 ? out[out.length - 2]!.degree : endDegree;
  let target = lo;
  let bestDist = Infinity;
  for (let d = lo; d <= hi; d++) {
    if (((d % n) + n) % n === endDegree && Math.abs(d - before) < bestDist) {
      target = d;
      bestDist = Math.abs(d - before);
    }
  }
  last.degree = target;
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1]!.degree;
    const cur = out[i]!;
    if (Math.abs(cur.degree - next) > maxLeap) {
      cur.degree = next + Math.sign(cur.degree - next) * maxLeap;
    }
  }
  return out;
}

/** Splits a form such as "AABA" into its phrase letters. */
const letters = (form: string): string[] => form.split('');

/** The range in scale degrees a melody stays within: from the root up to the octave above. */
function degreeRange(level: MelodyLevel, n: number): { lo: number; hi: number } {
  return level === 'easy' ? { lo: 0, hi: Math.min(n, 5) } : { lo: 0, hi: n };
}

/**
 * A new melody: phrases of two bars in a form such as AABA, built on a scale, mostly by step, with
 * leaps that recover, chord tones on the first beat of every bar, a held note at every phrase end
 * and a last note on the tonic. The same spec always gives the same melody.
 */
export function generateMelody(profileId: string, spec: MelodySpec): Chart {
  const parentTonic = EXERCISE_TONICS[profileId];
  if (parentTonic === undefined) throw new Error(`no melodies for profile "${profileId}"`);
  const scale = SCALES[spec.scale];
  const level = LEVELS[spec.level];
  const rng = createRng(spec.seed * 7919 + SCALE_IDS.indexOf(spec.scale) * 104729 + level.bpm);
  const n = scale.steps.length;
  const root =
    parentTonic + (profileId === 'wind' ? mod12(scale.rootFromParent) : scale.rootFromParent);
  const { lo, hi } = degreeRange(spec.level, n);
  const dominant = degreeOfStep(scale, 7);
  // phrase ends in the order they are played: a question (the dominant), a pause on the second
  // degree, then home
  const closed: Record<string, number> = {};
  const ends = [dominant, 1];
  const form = letters(pick(rng, level.forms));

  const phrases = new Map<string, PhraseNote[]>();
  const notes: BeatNote[] = [];
  let from = 0;
  let beat = 0;
  form.forEach((letter, index) => {
    const isLast = index === form.length - 1;
    const endDegree = isLast
      ? 0
      : (closed[letter] ?? ends[Object.keys(closed).length % ends.length]!);
    closed[letter] ??= endDegree;
    let phrase: PhraseNote[];
    const seen = phrases.get(letter);
    if (seen) {
      // a repeat is the same phrase, with its ending changed where needed
      phrase = setEnd(seen, endDegree, level.maxLeap, lo, hi, n);
    } else {
      phrase = makePhrase(rng, scale, level, from, endDegree, lo, hi);
      phrases.set(letter, phrase);
    }
    phrase.forEach((p, i) => {
      // the last note of the piece rings for a full bar
      const beats = isLast && i === phrase.length - 1 ? BEATS_PER_BAR : p.beats;
      notes.push({
        beat: beat + p.start,
        beats: beats * 0.88,
        pitch: degreeToMidi(scale, root, p.degree),
      });
    });
    from = phrase[phrase.length - 1]!.degree;
    beat += BEATS_PER_PHRASE;
  });

  return chartFromBeats(
    {
      title: `Random melody ${spec.seed}: ${scale.label}, ${spec.level}`,
      artist: 'Lineup',
      bpm: level.bpm,
      instruments: [profileId],
      tonic: parentTonic,
    },
    notes,
  );
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** A fresh seed from the clock or any random source. */
export const randomSeed = (rng: () => number = Math.random): number =>
  Math.floor(rng() * (MAX_SEED + 1));

/** Whether a melody should stay the same when played again: which seeds are valid. */
export const isSeed = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_SEED;

/** The id a generated melody is stored and scored under: `gen-<profile>-<scale>-<level>-<seed>`. */
export const melodyId = (profileId: string, spec: MelodySpec): string =>
  `gen-${profileId}-${spec.scale}-${spec.level}-${spec.seed}`;

const MELODY_ID = /^gen-([a-z]+)-([a-z-]+)-(easy|medium|hard)-(\d{1,5})$/;

/** The profile and spec an id names, or null if it is not a generated melody's id. */
export function parseMelodyId(id: string): { profileId: string; spec: MelodySpec } | null {
  const m = MELODY_ID.exec(id);
  if (!m) return null;
  const [, profileId, scale, level, seed] = m;
  if (!isScaleId(scale) || !isMelodyLevel(level)) return null;
  const n = Number(seed);
  if (!isSeed(n) || EXERCISE_TONICS[profileId!] === undefined) return null;
  return { profileId: profileId!, spec: { seed: n, scale, level } };
}
