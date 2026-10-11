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

/**
 * One bar of a rock-style kit beat: kick on the one, snare on the backbeat (two and four), and
 * the hat filling the other eighths when the level asks for it. Only one drum sounds at a time,
 * because the microphone hears one onset per step.
 */
function kitBar(rng: Rng, level: MelodyLevel): Bar {
  const bar = empty();
  bar[0] = 'kick';
  bar[2] = 'snare';
  bar[6] = 'snare';
  if (level === 'easy') {
    bar[4] = 'kick';
    return bar;
  }
  // the hat rides the eighths that are left
  for (const i of [1, 3, 5, 7]) bar[i] = 'hat';
  if (level === 'medium') {
    bar[4] = 'kick';
    return bar;
  }
  // hard: the second kick moves around and the hat drops out where the kick lands
  const kick = pick(rng, [4, 5, 3]);
  bar[kick] = 'kick';
  if (chance(rng, 0.5)) bar[7] = null;
  return bar;
}

/** A bar that ends the phrase: the snare rolls across the second half. */
function kitFill(level: MelodyLevel): Bar {
  const bar = empty();
  bar[0] = 'kick';
  bar[2] = 'snare';
  const from = level === 'easy' ? 6 : 4;
  for (let i = from; i < STEPS_PER_BAR; i++) bar[i] = 'snare';
  return bar;
}

/** Claps on the strong beats and taps on the off-beats between; one hand at a time. */
function handBar(rng: Rng, level: MelodyLevel): Bar {
  const bar = empty();
  for (const i of [0, 4]) bar[i] = 'clap';
  if (level === 'easy') return bar;
  bar[2] = 'tap';
  bar[6] = 'tap';
  if (level === 'hard') {
    bar[pick(rng, [3, 5, 7])] = 'tap';
  }
  return bar;
}

function handFill(): Bar {
  const bar = empty();
  bar[0] = 'clap';
  bar[4] = 'tap';
  bar[5] = 'tap';
  bar[6] = 'clap';
  bar[7] = 'clap';
  return bar;
}

/** A single-lane clap rhythm: a motif that repeats, answered by a variation. */
function clapBar(rng: Rng, level: MelodyLevel): Bar {
  const motifs: Record<MelodyLevel, readonly number[][]> = {
    easy: [
      [0, 2, 4, 6],
      [0, 4],
      [0, 2, 4],
    ],
    medium: [
      [0, 3, 4, 6],
      [0, 2, 4, 5],
      [0, 3, 4],
    ],
    hard: [
      [0, 3, 4, 7],
      [0, 1, 3, 4, 6],
      [0, 3, 5, 6],
    ],
  };
  const bar = empty();
  for (const i of pick(rng, motifs[level])) bar[i] = 'hit';
  return bar;
}

function clapFill(): Bar {
  const bar = empty();
  for (const i of [0, 4, 5, 6, 7]) bar[i] = 'hit';
  return bar;
}

/**
 * A new groove: eight bars where the main bar repeats, every second phrase answers with a small
 * variation and the last bar of each four is a fill that leads into the next phrase. The same
 * spec always gives the same groove.
 */
export function generateGroove(profile: GrooveProfile, spec: GrooveSpec): Chart {
  const rng = createRng(
    spec.seed * 4099 + MELODY_LEVELS.indexOf(spec.level) * 17 + GROOVE_PROFILES.indexOf(profile),
  );
  const make = {
    'drum-kit': { bar: kitBar, fill: () => kitFill(spec.level) },
    'hand-percussion': { bar: handBar, fill: handFill },
    clap: { bar: clapBar, fill: clapFill },
  }[profile];
  const main = make.bar(rng, spec.level);
  const answer = spec.level === 'easy' ? main : make.bar(rng, spec.level);
  const fill = make.fill();
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
