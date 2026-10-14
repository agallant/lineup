import { songsFor, type SongCategory } from '@lineup/core';
import { starsBySong } from './scoreboard';
import type { BestScore } from './scores';

/** A medal for how much of a family has been cleared with three stars. */
export type Tier = 'none' | 'bronze' | 'silver' | 'gold';

export const TIER_LABEL: Record<Tier, string> = {
  none: 'No badge yet',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
};

export const TIER_ICON: Record<Tier, string> = {
  none: '○',
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
};

/** A group of songs that badges are earned for: a game's songs, or its exercises. */
interface FamilyDef {
  id: string;
  label: string;
  game: string;
  /** The profiles whose songs belong to it. */
  profiles: readonly string[];
  category: SongCategory;
}

const BEAT = ['clap', 'hand-percussion', 'drum-kit'] as const;

const FAMILIES: readonly FamilyDef[] = [
  {
    id: 'sing-songs',
    label: 'Singline songs',
    game: 'Singline',
    profiles: ['voice'],
    category: 'song',
  },
  {
    id: 'sing-exercises',
    label: 'Singline exercises',
    game: 'Singline',
    profiles: ['voice'],
    category: 'exercise',
  },
  {
    id: 'wind-songs',
    label: 'Windline songs',
    game: 'Windline',
    profiles: ['wind'],
    category: 'song',
  },
  {
    id: 'wind-flute',
    label: 'Pentatonic flute songs',
    game: 'Windline',
    profiles: ['wind'],
    category: 'flute',
  },
  {
    id: 'wind-exercises',
    label: 'Windline exercises',
    game: 'Windline',
    profiles: ['wind'],
    category: 'exercise',
  },
  {
    id: 'strum-songs',
    label: 'Strumline songs',
    game: 'Strumline',
    profiles: ['ukulele-strum'],
    category: 'song',
  },
  {
    id: 'strum-exercises',
    label: 'Strumline exercises',
    game: 'Strumline',
    profiles: ['ukulele-strum'],
    category: 'exercise',
  },
  {
    id: 'bass-songs',
    label: 'Bassline songs',
    game: 'Bassline',
    profiles: ['bass'],
    category: 'song',
  },
  {
    id: 'bass-exercises',
    label: 'Bassline exercises',
    game: 'Bassline',
    profiles: ['bass'],
    category: 'exercise',
  },
  {
    id: 'key-pieces',
    label: 'Keyline pieces',
    game: 'Keyline',
    profiles: ['keyboard'],
    category: 'song',
  },
  {
    id: 'key-exercises',
    label: 'Keyline exercises',
    game: 'Keyline',
    profiles: ['keyboard'],
    category: 'exercise',
  },
  {
    id: 'beat-songs',
    label: 'Beatline rhythms',
    game: 'Beatline',
    profiles: BEAT,
    category: 'song',
  },
  {
    id: 'beat-exercises',
    label: 'Beatline exercises',
    game: 'Beatline',
    profiles: BEAT,
    category: 'exercise',
  },
];

/** One song of a family, with the most stars earned on it playing it whole and as written. */
export interface CollectionItem {
  profileId: string;
  songId: string;
  title: string;
  stars: number | null;
}

export interface Family {
  id: string;
  label: string;
  game: string;
  items: CollectionItem[];
  /** Songs with three stars, and the family's size. */
  cleared: number;
  total: number;
  tier: Tier;
}

/**
 * The medal for `cleared` of `total` songs three-starred: bronze from a quarter of them, silver from
 * half and gold for all of them. A family of a few songs needs at least one for bronze.
 */
export function tierFor(cleared: number, total: number): Tier {
  if (total <= 0 || cleared <= 0) return 'none';
  if (cleared >= total) return 'gold';
  if (cleared * 2 >= total) return 'silver';
  if (cleared * 4 >= total) return 'bronze';
  return 'none';
}

/** The families, with how much of each has been cleared with three stars, from the stored best scores. */
export function buildCollection(entries: readonly { key: string; best: BestScore }[]): Family[] {
  const stars = new Map<string, Map<string, number>>();
  const starsOf = (profile: string): Map<string, number> => {
    let m = stars.get(profile);
    if (!m) {
      m = starsBySong(entries, profile, true);
      stars.set(profile, m);
    }
    return m;
  };
  return FAMILIES.flatMap((def) => {
    const items: CollectionItem[] = def.profiles.flatMap((profileId) =>
      songsFor(profileId)
        .filter((s) => s.category === def.category)
        .map((s) => ({
          profileId,
          songId: s.id,
          title: s.chart.meta.title,
          stars: starsOf(profileId).get(s.id) ?? null,
        })),
    );
    if (items.length === 0) return [];
    const cleared = items.filter((i) => (i.stars ?? 0) >= 3).length;
    return [
      {
        id: def.id,
        label: def.label,
        game: def.game,
        items,
        cleared,
        total: items.length,
        tier: tierFor(cleared, items.length),
      },
    ];
  });
}

/** Badges earned: a family and its tier, for every family with a medal. */
export const earnedBadges = (families: readonly Family[]): { family: Family; tier: Tier }[] =>
  families.filter((f) => f.tier !== 'none').map((f) => ({ family: f, tier: f.tier }));

/** The route that opens a song in its game. */
export function songHref(profileId: string, songId: string): string {
  const id = encodeURIComponent(songId);
  switch (profileId) {
    case 'voice':
      return `#/sing?song=${id}`;
    case 'wind':
      return `#/wind?song=${id}`;
    case 'ukulele-strum':
      return `#/strum?song=${id}`;
    case 'bass':
      return `#/bass?song=${id}`;
    case 'keyboard':
      return `#/keys?song=${id}`;
    default:
      return `#/beat?mode=${encodeURIComponent(profileId)}&song=${id}`;
  }
}
