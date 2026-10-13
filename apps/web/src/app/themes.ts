import type { PlayResult } from './progress';

/** A themed week: a goal on top of the daily challenge, the same for everyone in the same week. */
export interface Theme {
  id: string;
  title: string;
  /** What to do, in a sentence. */
  blurb: string;
  /** How many matching songs (cleared at 60% or better) finish the week. */
  goal: number;
  /** A route to start from. */
  href: string;
  /** Whether a finished song counts toward it; `isNew` is true the first time a song is ever played. */
  matches(play: PlayResult, isNew: boolean): boolean;
}

const id = (p: PlayResult): string => p.songId;

/** The themes, in the order the weeks take them. */
export const THEMES: readonly Theme[] = [
  {
    id: 'waltz',
    title: 'Waltz week',
    blurb:
      'Play three songs in three-four time: a random waltz on the ukulele, Minuet in G, Happy Birthday.',
    goal: 3,
    href: '#/strum',
    matches: (p) => p.waltz === true,
  },
  {
    id: 'pentatonic',
    title: 'Pentatonic week',
    blurb:
      'Play three songs or exercises on the five-note scale: flute songs, pentatonic scales or random pentatonic melodies.',
    goal: 3,
    href: '#/wind',
    matches: (p) =>
      /pentatonic|^flute-|^gen-flute-/.test(id(p)) && !/^gen-chords-|^gen-waltz-/.test(id(p)),
  },
  {
    id: 'slow',
    title: 'Slow and steady week',
    blurb:
      'Play three songs slower than written (practice speed 80% or less): accuracy first, speed later.',
    goal: 3,
    href: '#/wind',
    matches: (p) => p.speed !== undefined && p.speed <= 0.8,
  },
  {
    id: 'fresh',
    title: 'Fresh songs week',
    blurb: 'Play three songs you have never played before, in any game.',
    goal: 3,
    href: '#/',
    matches: (_p, isNew) => isNew,
  },
  {
    id: 'random',
    title: 'Surprise week',
    blurb:
      'Play three random songs (melody, chord song, waltz, groove or flute song) and press New song each time.',
    goal: 3,
    href: '#/',
    matches: (p) => /^gen-/.test(id(p)),
  },
  {
    id: 'ear',
    title: 'Ear training week',
    blurb: 'Finish three ear-training rounds.',
    goal: 3,
    href: '#/ear',
    matches: (p) => p.profileId === 'ear',
  },
  {
    id: 'rhythm',
    title: 'Rhythm week',
    blurb: 'Play three Beatline rhythms or grooves.',
    goal: 3,
    href: '#/beat',
    matches: (p) => ['clap', 'hand-percussion', 'drum-kit'].includes(p.profileId),
  },
  {
    id: 'tough',
    title: 'Challenge week',
    blurb: 'Clear two songs rated 6 or harder with 70% accuracy or better.',
    goal: 2,
    href: '#/',
    matches: (p) => p.rating >= 6 && p.accuracy >= 0.7,
  },
  {
    id: 'exercise',
    title: 'Exercise week',
    blurb: 'Play three scales or exercises, the practice that makes the songs easier.',
    goal: 3,
    href: '#/',
    matches: (p) => /^ex-/.test(id(p)),
  },
];

const DAY_MS = 86_400_000;

/** The Monday that starts the week containing `d` (local), as "2026-10-12". */
export function weekStart(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

/** The theme for the week containing `d`: everyone gets the same one, and the list takes its turns. */
export function themeForWeek(d: Date): Theme {
  const [y, m, day] = weekStart(d).split('-').map(Number) as [number, number, number];
  const weeks = Math.floor(Date.UTC(y, m - 1, day) / DAY_MS / 7);
  return THEMES[weeks % THEMES.length]!;
}

/** XP for finishing a themed week, once. */
export const WEEKLY_BONUS = 100;
