import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { chance, createRng, pick, type Rng } from './random';
import { isMelodyLevel, isSeed, MELODY_LEVELS, type MelodyLevel } from './melody';

/** The percussion profiles grooves are written for. */
export type GrooveProfile = 'drum-kit' | 'hand-percussion' | 'clap';

/** All percussion profiles that have generated grooves. */
export const GROOVE_PROFILES: readonly GrooveProfile[] = ['drum-kit', 'hand-percussion', 'clap'];

/** Inputs that determine a generated groove: a small whole-number seed and a difficulty level. */
export interface GrooveSpec {
  seed: number;
  level: MelodyLevel;
}

const STEPS_PER_BAR = 8; // eighth notes in 4/4
const BARS = 8;

const BPM: Readonly<Record<MelodyLevel, number>> = { easy: 72, medium: 80, hard: 84 };

type Bar = (string | null)[]; // a lane id or nothing on each step

const empty = (): Bar => Array.from({ length: STEPS_PER_BAR }, () => null);

/** A bar written as text, one character per eighth note: K kick, S snare, C clap, t tap, h hat, . nothing. */
const LANE_OF: Readonly<Record<string, string>> = {
  K: 'kick',
  S: 'snare',
  C: 'clap',
  t: 'tap',
  h: 'hat',
  X: 'hit',
};
const fromText = (text: string): Bar => [...text].map((c) => LANE_OF[c] ?? null);

/** Some of `items`, at most `count`, in no particular order. */
function some<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const left = [...items];
  const out: T[] = [];
  while (out.length < count && left.length)
    out.push(left.splice(Math.floor(rng() * left.length), 1)[0]!);
  return out;
}

/** A fill that differs from the bar it leads out of. */
function differentFill(rng: Rng, fills: readonly string[], main: Bar): Bar {
  const key = main.join();
  const options = fills.map(fromText).filter((f) => f.join() !== key);
  return pick(rng, options.length ? options : fills.map(fromText));
}

/**
 * The beats a kit groove is built on, kick and snare only, each a rock, half-time or syncopated
 * pattern with the kick on the one. Only one drum sounds at a time, because the microphone hears
 * one onset per step.
 */
const KIT_BASES: Readonly<Record<MelodyLevel, readonly string[]>> = {
  easy: ['K.S.K.S.', 'K.S...S.', 'K...S...', 'K.S.KKS.', 'KKS.K.S.', 'K.S..KS.', 'K..KS...'],
  medium: ['K.S.K.S.', 'K.S..KS.', 'K...S.K.', 'K.S.KKS.', 'K.SK..S.', 'KK..S..K'],
  hard: ['K..KS..K', 'K.S..KS.', 'K..KS.K.', 'K.SK.KS.', 'KK.KS.S.', 'K.S.KK.S'],
};

const KIT_FILLS: Readonly<Record<MelodyLevel, readonly string[]>> = {
  easy: ['K.S...SS', 'K.S.K.SS', 'K.S.S.SS', 'K.S.SSSS', 'K.SSK.SS'],
  medium: ['K.S.SSSS', 'K.S.K.SS', 'K.SSSSSS', 'K.S.S.SS', 'K.S..SSS'],
  hard: ['K.S.SSSS', 'K.SKSKSS', 'K.SSSSSS', 'KKS.SSSS', 'K.S.SKSS'],
};

/** One bar of a kit beat: a base pattern, with the hat filling the free eighths as the level asks. */
function kitBar(rng: Rng, level: MelodyLevel, base?: string): Bar {
  const bar = fromText(base ?? pick(rng, KIT_BASES[level]));
  if (level === 'easy') return bar;
  const free = bar.flatMap((lane, i) => (lane === null ? [i] : []));
  if (level === 'medium') {
    // the hat rides the off-beats, except where a kick or snare already sits
    for (const i of free.filter((i) => i % 2 === 1)) bar[i] = 'hat';
    return bar;
  }
  // hard: the hat rides every free off-beat, and a kick or ghost snare may take one of them, so
  // some beats are only felt in the gaps (syncopation)
  const offbeats = free.filter((i) => i % 2 === 1);
  const spot = chance(rng, 0.7) ? pick(rng, offbeats) : -1;
  for (const i of offbeats) bar[i] = i === spot ? pick(rng, ['kick', 'snare']) : 'hat';
  return bar;
}

/** Claps on the strong beats and taps between, one hand at a time. */
function handBar(rng: Rng, level: MelodyLevel): Bar {
  const bar = empty();
  bar[0] = 'clap';
  bar[pick(rng, level === 'easy' ? [4, 4, 4, 3] : [4, 4, 3, 5])] = 'clap';
  const taps = {
    easy: some(rng, [2, 6], Math.floor(rng() * 3)),
    medium: [
      ...some(rng, [2, 6], 1 + Math.floor(rng() * 2)),
      ...some(rng, [1, 3, 5, 7], Math.floor(rng() * 2)),
    ],
    hard: [...some(rng, [2, 6], 2), ...some(rng, [1, 3, 5, 7], 1 + Math.floor(rng() * 2))],
  }[level];
  for (const i of taps) if (bar[i] === null) bar[i] = 'tap';
  // never a bar with next to nothing in it
  if (bar.filter((l) => l !== null).length < 3) {
    for (const i of [2, 6]) bar[i] ??= 'tap';
  }
  return bar;
}

const HAND_FILLS: readonly string[] = ['C...ttCC', 'C.t.ttCC', 'C..tt.CC', 'C.tCttCC', 'Ctt.ttCC'];

/** A single-lane clap rhythm: the downbeat and a few more hits, more of them and further off the beat as the level rises. */
function clapBar(rng: Rng, level: MelodyLevel): Bar {
  const from: Record<MelodyLevel, readonly number[]> = {
    easy: [2, 4, 4, 6],
    medium: [2, 3, 4, 4, 5, 6],
    hard: [1, 2, 3, 4, 5, 6, 7],
  };
  const count = {
    easy: 1 + Math.floor(rng() * 3),
    medium: 2 + Math.floor(rng() * 3),
    hard: 3 + Math.floor(rng() * 3),
  }[level];
  const bar = empty();
  bar[0] = 'hit';
  for (const i of some(rng, [...new Set(from[level])], count)) bar[i] = 'hit';
  return bar;
}

const CLAP_FILLS: readonly string[] = ['X...XXXX', 'X.X.XXXX', 'X...X.XX', 'X.X.X.XX', 'X..XXXXX'];

/**
 * A new groove: eight bars where the main bar repeats, every second phrase answers with a small
 * variation and the last bar of each four is a fill that leads into the next phrase. The beat, the
 * hits and the fill are all chosen from the seed, so two seeds rarely share a groove. The same
 * spec always gives the same groove.
 */
export function generateGroove(profile: GrooveProfile, spec: GrooveSpec): Chart {
  const rng = createRng(
    spec.seed * 4099 + MELODY_LEVELS.indexOf(spec.level) * 17 + GROOVE_PROFILES.indexOf(profile),
  );
  const make = {
    'drum-kit': {
      bar: kitBar,
      fills: KIT_FILLS[spec.level],
    },
    'hand-percussion': { bar: handBar, fills: HAND_FILLS },
    clap: { bar: clapBar, fills: CLAP_FILLS },
  }[profile];
  const main = make.bar(rng, spec.level);
  // the answer is the same beat with its own small changes (the easy level just repeats it)
  const answer = spec.level === 'easy' ? main : make.bar(rng, spec.level);
  const fill = differentFill(rng, make.fills, main);
  const notes: BeatNote[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const last = bar % 4 === 3;
    // the very last bar finishes on a single hit instead of another fill
    const steps =
      bar === BARS - 1
        ? empty().map((_, i) => (i === 0 ? (main[0] ?? 'hit') : null))
        : last
          ? fill
          : bar % 4 === 2 && spec.level !== 'easy'
            ? answer
            : main;
    steps.forEach((lane, i) => {
      if (lane !== null) notes.push({ beat: bar * 4 + i / 2, lane });
    });
  }
  return chartFromBeats(
    {
      title: `Random groove ${spec.seed}: ${spec.level}`,
      artist: 'Lineup',
      bpm: BPM[spec.level],
      instruments: [profile],
    },
    notes,
  );
}

/** The id a generated groove is stored and scored under: `gen-groove-<profile>-<level>-<seed>`. */
export const grooveId = (profile: GrooveProfile, spec: GrooveSpec): string =>
  `gen-groove-${profile}-${spec.level}-${spec.seed}`;

const GROOVE_ID =
  /^gen-groove-(drum-kit|hand-percussion|clap)-(easy|medium|hard)-(0|[1-9]\d{0,4})$/;

/** The profile and spec an id names, or null if it is not a generated groove's id. */
export function parseGrooveId(id: string): { profile: GrooveProfile; spec: GrooveSpec } | null {
  const m = GROOVE_ID.exec(id);
  if (!m) return null;
  const level = m[2];
  const seed = Number(m[3]);
  if (!isMelodyLevel(level) || !isSeed(seed)) return null;
  return { profile: m[1] as GrooveProfile, spec: { seed, level } };
}
