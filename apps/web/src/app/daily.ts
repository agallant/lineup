import {
  MAX_SEED,
  chordSongId,
  grooveId,
  hashSeed,
  melodyId,
  melodyScalesFor,
  type MelodyLevel,
  type MelodySpec,
} from '@lineup/core';
import { dayKey } from './progress';

/** The games that have a daily challenge. */
export type DailyGame = 'singline' | 'windline' | 'strumline' | 'beatline';

export interface Daily {
  game: DailyGame;
  /** The hash route that opens the game with today's challenge chosen. */
  href: string;
  /** The random song (seed, scale, level) that everyone gets today. */
  spec: MelodySpec;
  /** The id the song is stored and scored under. */
  id: string;
  /** A line for the home menu. */
  label: string;
}

/** Easy on the weekend and early in the week, harder towards the end of it. */
const LEVEL_BY_WEEKDAY: readonly MelodyLevel[] = [
  'easy', // Sunday
  'easy',
  'medium',
  'medium',
  'medium',
  'hard',
  'easy', // Saturday
];

/** Each game's profile for the random song, and the route that opens it. */
const GAMES: Readonly<Record<DailyGame, { profile: string; route: string; name: string }>> = {
  singline: { profile: 'voice', route: 'sing', name: 'Singline' },
  windline: { profile: 'wind', route: 'wind', name: 'Windline' },
  strumline: { profile: 'ukulele-strum', route: 'strum', name: 'Strumline' },
  beatline: { profile: 'clap', route: 'beat', name: 'Beatline' },
};

export const DAILY_GAMES: readonly DailyGame[] = ['singline', 'windline', 'strumline', 'beatline'];

/** The challenge for a game on a day: the same for everyone, new each day, no network involved. */
export function dailyFor(game: DailyGame, now = new Date()): Daily {
  const day = dayKey(now);
  const g = GAMES[game];
  const hash = hashSeed(`${day}|${game}`);
  const level = LEVEL_BY_WEEKDAY[now.getDay()]!;
  const scales = melodyScalesFor(g.profile);
  const scale =
    game === 'singline' || game === 'windline' ? scales[hash % scales.length]! : 'major';
  const spec: MelodySpec = { seed: hash % (MAX_SEED + 1), scale, level };
  const id =
    game === 'strumline'
      ? chordSongId(spec)
      : game === 'beatline'
        ? grooveId('clap', spec)
        : melodyId(g.profile, spec);
  const what =
    game === 'strumline'
      ? 'a chord song'
      : game === 'beatline'
        ? 'a clap groove'
        : `a ${scale} melody`;
  return {
    game,
    href: `#/${g.route}?daily`,
    spec,
    id,
    label: `${g.name}: ${what}, ${level}`,
  };
}

/** The key under which a cleared daily challenge is remembered. */
export const dailyKey = (game: DailyGame, now = new Date()): string => `${dayKey(now)}|${game}`;

/** Whether the page was opened from today's challenge link (`#/sing?daily`). */
export const wantsDaily = (hash: string): boolean => /\?(.*&)?daily(&|=|$)/.test(hash);
