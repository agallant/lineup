import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { createRng, pick, pickWeighted, type Rng } from './random';
import { isMelodyLevel, isSeed, MELODY_LEVELS, type MelodyLevel } from './melody';
import { SCALES, degreeToMidi, type ScaleId } from './theory';

/**
 * Songs for the pentatonic flutes (Native American flute, shakuhachi): slow phrases of a few
 * notes with long held tones, a breath between phrases, and nothing outside the five notes of
 * the scale. Written in the major tonic that holds the same notes (C), like every other song, so
 * a flute whose lowest note is A fits it directly.
 */

/** The two scales a flute song comes in: a minor mood that starts on the lowest note, or a major one. */
export const FLUTE_SCALES = [
  'minor-pentatonic',
  'major-pentatonic',
] as const satisfies readonly ScaleId[];
export type FluteScale = (typeof FLUTE_SCALES)[number];

export const isFluteScale = (v: unknown): v is FluteScale =>
  (FLUTE_SCALES as readonly unknown[]).includes(v);

/** Inputs that determine a generated flute song. */
export interface FluteSpec {
  seed: number;
  scale: FluteScale;
  level: MelodyLevel;
}

/** The tonic of the major scale the songs are written in (C5), as for every wind song. */
const TONIC = 72;
/** The lowest note of an A flute, 3 below the tonic: the lowest note any song asks for. */
const FLOOR = TONIC - 3;

interface LevelDef {
  bpm: number;
  /** Phrases of eight beats: a note length each, negative for a rest (the breath). */
  rhythms: readonly (readonly number[])[];
  /** Motion in scale degrees and how often each occurs. */
  moves: readonly { by: number; weight: number }[];
  /** The highest degree used, counting up from the lowest note of the scale. */
  hi: number;
  /** The largest jump between neighbouring notes, in degrees. */
  maxLeap: number;
  forms: readonly string[];
}

const LEVELS: Readonly<Record<MelodyLevel, LevelDef>> = {
  easy: {
    bpm: 52,
    rhythms: [
      [2, 2, 2, -2],
      [4, 2, -2],
      [2, 1, 1, 2, -2],
      [3, 1, 2, -2],
      [2, 2, 1, 1, -2],
    ],
    moves: [
      { by: 0, weight: 10 },
      { by: 1, weight: 75 },
      { by: 2, weight: 15 },
    ],
    hi: 5,
    maxLeap: 2,
    forms: ['AABA', 'ABAB'],
  },
  medium: {
    bpm: 60,
    rhythms: [
      [1, 1, 2, 2, -2],
      [2, 1, 1, 1, 1, -2],
      [1.5, 0.5, 1, 1, 2, -2],
      [2, 2, 1, 1, -2],
    ],
    moves: [
      { by: 0, weight: 5 },
      { by: 1, weight: 60 },
      { by: 2, weight: 25 },
      { by: 3, weight: 10 },
    ],
    hi: 7,
    maxLeap: 3,
    forms: ['AABA', 'ABAB', 'ABAC'],
  },
  hard: {
    bpm: 72,
    rhythms: [
      [1, 0.5, 0.5, 1, 1, 2, -2],
      [0.5, 0.5, 1, 0.5, 0.5, 1, 2, -2],
      [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 1, -2],
      [2, 1, 0.5, 0.5, 1, 1, -2],
    ],
    moves: [
      { by: 0, weight: 4 },
      { by: 1, weight: 46 },
      { by: 2, weight: 28 },
      { by: 3, weight: 14 },
      { by: 4, weight: 8 },
    ],
    hi: 9,
    maxLeap: 4,
    forms: ['ABAC', 'ABCB', 'AABC'],
  },
};

/** The fifth of the scale, where a phrase pauses on a question; the root is where it comes home. */
const FIFTH = 3;
const PER_OCTAVE = 5;

/** The degree with the same place in the scale as `place` (0 to 4) nearest `near`, within [lo, hi]. */
function nearestDegree(place: number, near: number, lo: number, hi: number): number {
  let best = lo;
  let bestDist = Infinity;
  for (let d = lo; d <= hi; d++) {
    if (((d % PER_OCTAVE) + PER_OCTAVE) % PER_OCTAVE === place && Math.abs(d - near) < bestDist) {
      best = d;
      bestDist = Math.abs(d - near);
    }
  }
  return best;
}

/**
 * One phrase: a rhythm from the level's table and a walk over the scale that leans up in its first
 * half and back down in its second, finishing on `endPlace` (0 for home, 3 for the question).
 */
function makePhrase(
  rng: Rng,
  level: LevelDef,
  rhythm: readonly number[],
  from: number,
  endPlace: number,
  lo: number,
  hi: number,
): { degree: number; beats: number }[] {
  const sounding = rhythm.filter((b) => b > 0);
  const degrees: number[] = [];
  let at = Math.min(hi, Math.max(lo, from));
  sounding.forEach((_, i) => {
    if (i > 0) {
      const rising = i < sounding.length / 2;
      const options: { item: number; weight: number }[] = [];
      for (const { by, weight } of level.moves) {
        for (const sign of by === 0 ? [1] : [1, -1]) {
          const d = at + sign * by;
          if (d < lo || d > hi) continue;
          // lean the way the phrase is going, and back toward the middle of the range
          const lean = sign === (rising ? 1 : -1) ? 1.6 : 1;
          const mid = (lo + hi) / 2;
          const toward = Math.abs(d - mid) < Math.abs(at - mid) ? 1.3 : 1;
          options.push({ item: d, weight: weight * lean * toward });
        }
      }
      at = options.length ? pickWeighted(rng, options) : at;
    }
    degrees.push(at);
  });
  // finish on the ending place, then walk back so no jump is bigger than the level allows
  const last = degrees.length - 1;
  degrees[last] = nearestDegree(endPlace, degrees[Math.max(0, last - 1)]!, lo, hi);
  for (let i = last - 1; i >= 0; i--) {
    if (Math.abs(degrees[i]! - degrees[i + 1]!) > level.maxLeap) {
      degrees[i] = degrees[i + 1]! + Math.sign(degrees[i]! - degrees[i + 1]!) * level.maxLeap;
    }
  }
  let n = 0;
  return rhythm.map((beats) => ({ degree: beats > 0 ? degrees[n++]! : 0, beats }));
}

/**
 * A new flute song: four phrases of eight beats in a form such as AABA, each a few long notes and a
 * breath, the first phrases pausing on the fifth and the last coming home to a long held note. The
 * same spec always gives the same song.
 */
export function generateFluteSong(spec: FluteSpec): Chart {
  const scale = SCALES[spec.scale];
  const level = LEVELS[spec.level];
  const rng = createRng(
    spec.seed * 8209 +
      FLUTE_SCALES.indexOf(spec.scale) * 104729 +
      MELODY_LEVELS.indexOf(spec.level) * 31 +
      5,
  );
  // the root of the scale, and the lowest degree an A flute can play (the major scale starts a
  // minor third above the flute's lowest note, so it may dip one degree below its root)
  const root = spec.scale === 'minor-pentatonic' ? TONIC - 3 : TONIC;
  const lo = degreeToMidi(scale, root, -1) >= FLOOR ? -1 : 0;
  const hi = level.hi + (lo < 0 ? 0 : 0);
  const form = pick(rng, level.forms);

  const phrases = new Map<string, { degree: number; beats: number }[]>();
  const notes: BeatNote[] = [];
  let from = 0;
  let beat = 0;
  [...form].forEach((letter, index) => {
    const isLast = index === form.length - 1;
    // a repeated phrase is the same phrase; only the last one changes its ending to come home
    const rhythm = pick(rng, level.rhythms);
    let phrase = phrases.get(letter);
    if (!phrase || isLast) {
      const endPlace = isLast ? 0 : FIFTH;
      phrase = phrase
        ? phrase.map((n, i, all) =>
            i === lastSounding(all)
              ? { ...n, degree: nearestDegree(endPlace, n.degree, lo, hi) }
              : n,
          )
        : makePhrase(rng, level, rhythm, from, endPlace, lo, hi);
    }
    if (!phrases.has(letter)) phrases.set(letter, phrase);
    let start = beat;
    phrase.forEach((n, i) => {
      if (n.beats > 0) {
        // the last note of the song is held for a full bar
        const held = isLast && i === lastSounding(phrase!) ? 4 : n.beats;
        notes.push({
          beat: start,
          beats: held * 0.92,
          pitch: degreeToMidi(scale, root, n.degree),
        });
      }
      start += Math.abs(n.beats);
    });
    from = phrase[lastSounding(phrase)]!.degree;
    beat += 8;
  });
  return chartFromBeats(
    {
      title: `Random flute song ${spec.seed}: ${scale.label}, ${spec.level}`,
      artist: 'Lineup',
      bpm: level.bpm,
      instruments: ['wind'],
      tonic: TONIC,
    },
    notes,
  );
}

/** The index of the last sounding note of a phrase (the one before the breath). */
function lastSounding(phrase: readonly { beats: number }[]): number {
  for (let i = phrase.length - 1; i >= 0; i--) if (phrase[i]!.beats > 0) return i;
  return 0;
}

/** The id a generated flute song is stored and scored under: `gen-flute-<scale>-<level>-<seed>`. */
export const fluteId = (spec: FluteSpec): string =>
  `gen-flute-${spec.scale}-${spec.level}-${spec.seed}`;

const FLUTE_ID =
  /^gen-flute-(minor-pentatonic|major-pentatonic)-(easy|medium|hard)-(0|[1-9]\d{0,4})$/;

/** The spec an id names, or null if it is not a generated flute song's id. */
export function parseFluteId(id: string): FluteSpec | null {
  const m = FLUTE_ID.exec(id);
  if (!m) return null;
  const [, scale, level, seed] = m;
  const n = Number(seed);
  if (!isFluteScale(scale) || !isMelodyLevel(level) || !isSeed(n)) return null;
  return { seed: n, scale, level };
}
