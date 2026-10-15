import { rateChart, songCategory, songsFor, type Chart } from '@lineup/core';
import { starsBySong } from './scoreboard';
import type { BestScore } from './scores';

/** A song as a pack lists it. */
export interface PackSong {
  profileId: string;
  songId: string;
  title: string;
  /** Difficulty, 1 to 10. */
  rating: number;
  /** Most stars earned on it (0 to 3), or null if never played. */
  stars: number | null;
}

/** A themed set of songs from across the games. */
export interface Pack {
  id: string;
  title: string;
  blurb: string;
  songs: PackSong[];
  /** Songs cleared with three stars. */
  cleared: number;
}

/** A song a pack's rule is asked about. */
interface Candidate {
  profileId: string;
  id: string;
  chart: Chart;
  rating: number;
  scale: string | null;
  flute: boolean;
}

interface PackDef {
  id: string;
  title: string;
  blurb: string;
  test: (c: Candidate) => boolean;
}

const ids = (...list: string[]): ((c: Candidate) => boolean) => {
  const set = new Set(list);
  return (c) => set.has(c.id);
};

const PROFILES = [
  'voice',
  'wind',
  'ukulele-strum',
  'bass',
  'keyboard',
  'clap',
  'hand-percussion',
  'drum-kit',
] as const;
/** Games whose songs belong to their own pack, and stay out of the general ones. */
const SOLO = new Set(['bass', 'keyboard']);
const RHYTHM = new Set(['clap', 'hand-percussion', 'drum-kit']);

const DEFS: readonly PackDef[] = [
  {
    id: 'campfire',
    title: 'Campfire',
    blurb: 'Songs everyone knows, to sing, whistle or strum round a fire.',
    test: ids(
      'sing-oh-susanna',
      'wind-oh-susanna',
      'sing-old-macdonald',
      'wind-old-macdonald',
      'sing-yankee-doodle',
      'sing-london-bridge',
      'sing-row-boat',
      'strum-three-chords-g',
      'strum-skip-lou',
      'strum-sunny-day',
      'pick-mary-lamb',
    ),
  },
  {
    id: 'world',
    title: 'Around the world',
    blurb:
      'Tunes and strum rhythms from Mexico, Japan, Germany, Brazil, Spain, Jamaica and beyond.',
    test: (c) =>
      /^(sing|wind|keys)-(la-cucaracha|sakura|twinkle|canon-theme|deck-the-halls|frere-jacques|au-clair|alle-meine-entchen|haenschen-klein|kaeru-no-uta)$/.test(
        c.id,
      ) ||
      /^strum-(reggae|bossa|flamenco|tango|polka|ranchera)$/.test(c.id) ||
      /^bass-latin-/.test(c.id),
  },
  {
    id: 'world-rhythms',
    title: 'Rhythms of the world',
    blurb:
      'Clave, tresillo, tala claps, Arabic and Balkan meters: clap the patterns behind the music.',
    test: (c) =>
      /^(clap|hand)-(son-clave|rumba-clave|bossa-clave|tresillo|habanera|cinquillo|bembe-bell|flamenco-solea|teental|jhaptal|rupak|rachenitsa|aksak|kopanitsa|maqsum|baladi|saidi)$/.test(
        c.id,
      ),
  },
  {
    id: 'christmas',
    title: 'Winter holidays',
    blurb: 'Carols to sing, whistle or play: bells, a silent night and a merry Christmas.',
    test: (c) =>
      /^(sing|wind|keys)-(jingle-bells|silent-night|joy-to-the-world|deck-the-halls|merry-christmas)$/.test(
        c.id,
      ),
  },
  {
    id: 'lullabies',
    title: 'Lullabies and hymns',
    blurb: 'Slow, gentle songs and waltzes for a quiet evening.',
    test: ids(
      'sing-silent-night',
      'wind-silent-night',
      'sing-amazing-grace',
      'sing-au-clair',
      'wind-au-clair',
      'sing-happy-birthday',
      'strum-slow-waltz-g',
      'strum-waltz',
      'flute-night-fire',
      'flute-first-breath',
    ),
  },
  {
    id: 'waltz',
    title: 'Waltz time',
    blurb: 'Every song in three beats to the bar.',
    test: (c) => c.chart.meta.beatsPerBar === 3 && !c.flute && !SOLO.has(c.profileId),
  },
  {
    id: 'pentatonic',
    title: 'Pentatonic calm',
    blurb: 'Slow, breathing songs for a Native American flute, a shakuhachi or any flute.',
    test: (c) => c.flute,
  },
  {
    id: 'bass-lines',
    title: 'Bass lines',
    blurb: 'Blues, pop and rock lines for the bass guitar, root notes first.',
    test: (c) => c.profileId === 'bass',
  },
  {
    id: 'key-pieces',
    title: 'At the keyboard',
    blurb: 'Pieces for both hands and for a MIDI keyboard, from five fingers to chords.',
    test: (c) => c.profileId === 'keyboard',
  },
  {
    id: 'rhythm',
    title: 'Rhythm kitchen',
    blurb: 'Every clap, tap and drum-kit groove, from gentle to busy.',
    test: (c) => RHYTHM.has(c.profileId) && !c.flute,
  },
  {
    id: 'gentle',
    title: 'Gentle start',
    blurb: 'The easiest songs for voice, whistle and ukulele: a good first week.',
    test: (c) => !RHYTHM.has(c.profileId) && !c.flute && !SOLO.has(c.profileId) && c.rating <= 2,
  },
  {
    id: 'minor',
    title: 'Minor moods',
    blurb: 'Songs that sit in a minor key: darker, calmer, a little wistful.',
    test: ids(
      'sing-dusk-in-a',
      'wind-dusk-in-a',
      'strum-minor',
      'strum-minor-blues',
      'strum-rain-day',
      'strum-rising-sun',
    ),
  },
  {
    id: 'originals',
    title: 'Made for Lineup',
    blurb: 'Original tunes, chord songs and grooves written for this app, easiest first.',
    test: (c) => c.chart.meta.artist === 'Lineup' && !c.flute && !SOLO.has(c.profileId),
  },
  {
    id: 'chromatic',
    title: 'Beyond the white notes',
    blurb: 'Songs with sharps and flats outside their key.',
    test: (c) => c.scale === 'chromatic' && !c.flute,
  },
  {
    id: 'challenge',
    title: 'Challenge',
    blurb: 'The hardest songs, rated 7 or more.',
    test: (c) => c.rating >= 7 && !c.flute,
  },
];

/**
 * The song packs: themed sets drawn from every game's songs, with the stars earned on each.
 * Packs with no songs are left out.
 */
export function buildPacks(entries: readonly { key: string; best: BestScore }[]): Pack[] {
  const stars = new Map(PROFILES.map((p) => [p, starsBySong(entries, p)] as const));
  const candidates: Candidate[] = PROFILES.flatMap((profileId) =>
    songsFor(profileId)
      .filter((s) => s.category !== 'exercise')
      .map((s) => {
        const r = rateChart(s.chart);
        return {
          profileId,
          id: s.id,
          chart: s.chart,
          rating: r.score,
          scale: r.scale,
          flute: songCategory(s.id) === 'flute',
        };
      }),
  );
  return DEFS.flatMap((def) => {
    const songs: PackSong[] = candidates
      .filter(def.test)
      .map((c) => ({
        profileId: c.profileId,
        songId: c.id,
        title: c.chart.meta.title,
        rating: c.rating,
        stars: stars.get(c.profileId as (typeof PROFILES)[number])?.get(c.id) ?? null,
      }))
      .sort((a, b) => a.rating - b.rating || a.title.localeCompare(b.title));
    if (songs.length === 0) return [];
    return [
      {
        id: def.id,
        title: def.title,
        blurb: def.blurb,
        songs,
        cleared: songs.filter((s) => (s.stars ?? 0) >= 3).length,
      },
    ];
  });
}
