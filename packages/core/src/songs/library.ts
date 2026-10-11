import type { Chart } from '../chart';
import { grooveChart, melodyChart, pickedMelodyChart, strumChart } from './notation';

/**
 * Songs written in the notations of `notation.ts` (public domain tunes and original patterns).
 * Melodies are written once, around middle C, and placed for each pitched profile: the voice as
 * written and wind instruments an octave up, where a whistle or recorder sounds.
 */

interface Tune {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  /** The tonic of the major key it is written in, as written (C4 = 60). */
  tonic: number;
  notes: string;
  /** The tune as wind instruments play it, when a note must move to stay above the tonic. */
  windNotes?: string;
  /** Dips below the tonic, which a whistle or recorder cannot play, so it is for the voice only. */
  voiceOnly?: boolean;
}

/**
 * Tunes for the voice and for wind instruments, roughly easiest first. Most are in C major; each
 * names its own tonic, and a tune with sharps or flats outside its key is chromatic.
 */
const TUNES: readonly Tune[] = [
  {
    id: 'hot-cross-buns',
    title: 'Hot Cross Buns',
    artist: 'Traditional',
    bpm: 96,
    tonic: 60,
    notes: `E4:1 D4:1 C4:2 | E4:1 D4:1 C4:2 |
      C4:.5 C4:.5 C4:.5 C4:.5 D4:.5 D4:.5 D4:.5 D4:.5 | E4:1 D4:1 C4:2`,
  },
  {
    id: 'mary-lamb',
    title: 'Mary Had a Little Lamb',
    artist: 'Traditional',
    bpm: 108,
    tonic: 60,
    notes: `E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 |
      E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4`,
  },
  {
    id: 'row-boat',
    title: 'Row, Row, Row Your Boat',
    artist: 'Traditional',
    bpm: 100,
    tonic: 60,
    notes: `C4:1 C4:1 C4:1.5 D4:.5 | E4:1.5 D4:.5 E4:1.5 F4:.5 | G4:4 |
      C5:1/3 C5:1/3 C5:1/3 G4:1/3 G4:1/3 G4:1/3 E4:1/3 E4:1/3 E4:1/3 C4:1/3 C4:1/3 C4:1/3 |
      G4:1.5 F4:.5 E4:1.5 D4:.5 | C4:4`,
  },
  {
    id: 'frere-jacques',
    title: 'Frère Jacques',
    artist: 'Traditional',
    bpm: 108,
    tonic: 60,
    notes: `C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 |
      G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2`,
    // a whistle or recorder cannot play below its tonic, so its ending jumps up to the G instead
    windNotes: `C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 |
      G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | C4 G4 C4:2 | C4 G4 C4:2`,
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells (chorus)',
    artist: 'Pierpont',
    bpm: 116,
    tonic: 60,
    notes: `E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 |
      F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | E4 D4 D4 E4 | D4:2 G4:2`,
  },
  {
    id: 'silent-night',
    title: 'Silent Night',
    artist: 'Gruber',
    bpm: 84,
    tonic: 60,
    notes: `G4:1.5 A4:.5 G4 | E4:3 | G4:1.5 A4:.5 G4 | E4:3 |
      D5:2 D5 | B4:3 | C5:2 C5 | G4:3 |
      A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 |
      A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 |
      D5:2 D5 | F5:1.5 D5:.5 B4 | C5:3 | E5:3 |
      C5 G4 E4 | G4:1.5 F4:.5 D4 | C4:3`,
  },
  {
    id: 'auld-lang-syne',
    title: 'Auld Lang Syne',
    artist: 'Traditional',
    bpm: 92,
    tonic: 60,
    voiceOnly: true,
    notes: `G3 | C4:1.5 C4:.5 C4 E4 | D4:1.5 C4:.5 D4 E4 | C4:1.5 C4:.5 E4 G4 | A4:3 A4 |
      G4:1.5 E4:.5 E4 C4 | D4:1.5 C4:.5 D4 E4 | C4:1.5 A3:.5 A3 G3 | C4:4`,
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    artist: 'Traditional',
    bpm: 80,
    tonic: 60,
    voiceOnly: true,
    notes: `G3 | C4:2 E4:.5 C4:.5 | E4:2 D4 | C4:2 A3 | G3:2 G3 | C4:2 E4:.5 C4:.5 | E4:2 D4 | G4:3`,
  },
  {
    id: 'joy-to-the-world',
    title: 'Joy to the World (opening)',
    artist: 'Handel / Mason',
    bpm: 104,
    tonic: 60,
    notes: `C5 B4:.75 A4:.25 G4:1.5 F4:.5 | E4 D4 C4:2 | G4 A4:1.5 A4:.5 | B4:1.5 B4:.5 C5:2`,
  },
  {
    id: 'minuet-in-g',
    title: 'Minuet in G (opening)',
    artist: 'Petzold',
    bpm: 112,
    tonic: 67,
    notes: `D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4`,
  },
  {
    id: 'fur-elise',
    title: 'Für Elise (opening, chromatic)',
    artist: 'Beethoven',
    bpm: 112,
    tonic: 60,
    notes: `E5:.5 D#5:.5 E5:.5 D#5:.5 E5:.5 B4:.5 D5:.5 C5:.5 | A4:1.5 r:.5 C4:.5 E4:.5 A4:.5 | B4:1.5 r:.5 E4:.5 G#4:.5 B4:.5 | C5:1.5`,
  },
];

/** The same tunes as songs for one pitched profile, `shift` semitones from the written pitch. */
function tunesFor(
  profile: string,
  prefix: string,
  shift: number,
  wind = false,
): Record<string, Chart> {
  return Object.fromEntries(
    TUNES.filter((t) => !(wind && t.voiceOnly)).map((t) => [
      `${prefix}-${t.id}`,
      melodyChart(
        {
          title: t.title,
          artist: t.artist,
          bpm: t.bpm,
          instruments: [profile],
          tonic: t.tonic + shift,
        },
        wind && t.windNotes ? t.windNotes : t.notes,
        shift,
      ),
    ]),
  );
}

/** Songs to sing: written as above, from about G3 to F5. */
export const VOICE_SONGS: Readonly<Record<string, Chart>> = tunesFor('voice', 'sing', 0);

/** Songs for whistles and recorders: an octave up, so the lowest note is never below the tonic. */
export const WIND_SONGS: Readonly<Record<string, Chart>> = tunesFor('wind', 'wind', 12, true);

/** Chord songs for the ukulele: a chord per bar with a strum pattern that repeats. */
export const STRUM_SONGS: Readonly<Record<string, Chart>> = {
  'strum-fifties': strumChart(
    {
      title: 'Fifties progression (C Am F G)',
      artist: 'Lineup',
      bpm: 88,
      instruments: ['ukulele-strum'],
    },
    'C | Am | F | G | C | Am | F | G | C | Am | F | G | C | Am | F | G',
    'D . D U . U D U',
  ),
  'strum-skip-lou': strumChart(
    {
      title: 'Skip to My Lou (C G7)',
      artist: 'Traditional',
      bpm: 104,
      instruments: ['ukulele-strum'],
    },
    'C | C | G7 | C | C | C | G7 | C | C | C | G7 | C | C | G7 | C | C',
    'D . D . D U D .',
  ),
  'strum-blues': strumChart(
    {
      title: '12-bar blues in C (C F G7)',
      artist: 'Lineup',
      bpm: 92,
      instruments: ['ukulele-strum'],
    },
    'C | C | C | C | F | F | C | C | G7 | F | C | G7 | C | C | C | C | F | F | C | C | G7 | F | C | C',
    'D . D U . U D U',
  ),
  'strum-waltz': strumChart(
    {
      title: 'Waltz strum (C F G7), three beats a bar',
      artist: 'Lineup',
      bpm: 96,
      instruments: ['ukulele-strum'],
    },
    'C | C | F | C | G7 | G7 | C | C | C | C | F | F | G7 | F | C | C',
    'D . D U D .',
    { beatsPerBar: 3 },
  ),
  'strum-minor': strumChart(
    {
      title: 'Minor mood (Am Dm Em Am)',
      artist: 'Lineup',
      bpm: 84,
      instruments: ['ukulele-strum'],
    },
    'Am | Am | Dm | Dm | Em | Am | Dm | Am | Am | Am | Dm | Dm | Em | Em | Am | Am',
    'D . D U . U D U',
  ),
  'pick-hot-cross-buns': pickedMelodyChart(
    {
      title: 'Picking: Hot Cross Buns',
      artist: 'Traditional',
      bpm: 84,
      instruments: ['ukulele-strum'],
    },
    TUNES[0]!.notes,
  ),
  'pick-mary-lamb': pickedMelodyChart(
    {
      title: 'Picking: Mary Had a Little Lamb',
      artist: 'Traditional',
      bpm: 90,
      instruments: ['ukulele-strum'],
    },
    TUNES[1]!.notes,
  ),
  'pick-ode-to-joy': pickedMelodyChart(
    { title: 'Picking: Ode to Joy', artist: 'Beethoven', bpm: 90, instruments: ['ukulele-strum'] },
    `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 |
     E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2`,
  ),
};

/** Rhythms for the clap profile (one lane: every hit is a clap). */
export const CLAP_SONGS: Readonly<Record<string, Chart>> = {
  'clap-gallop': grooveChart(
    { title: 'Clap: gallop', artist: 'Lineup', bpm: 90, instruments: ['clap'] },
    { hit: 'x..xx.x. | x..xx.x. | x..xx.x. | x.x.x...' },
  ),
  'clap-syncopation': grooveChart(
    { title: 'Clap: off the beat', artist: 'Lineup', bpm: 84, instruments: ['clap'] },
    { hit: 'x..x..x. | .x..x... | x..x..x. | .x.x.x..' },
  ),
  'clap-waltz': grooveChart(
    { title: 'Clap: waltz (three beats a bar)', artist: 'Lineup', bpm: 100, instruments: ['clap'] },
    { hit: 'x.x.x. | x.x.x. | x.x.xx | x.x.x.' },
  ),
};

/** Rhythms for claps and taps (one sound at a time). */
export const HAND_SONGS: Readonly<Record<string, Chart>> = {
  'hand-call-response': grooveChart(
    {
      title: 'Clap & tap: call and response',
      artist: 'Lineup',
      bpm: 88,
      instruments: ['hand-percussion'],
    },
    {
      clap: 'x.x.x... | ........ | x.x.x... | ........',
      tap: '........ | x.x.x... | ........ | x.xxx.x.',
    },
  ),
  'hand-heartbeat': grooveChart(
    { title: 'Clap & tap: heartbeat', artist: 'Lineup', bpm: 76, instruments: ['hand-percussion'] },
    {
      clap: 'x...x... | x...x... | x...x... | x...x...',
      tap: '..x...x. | ..x...x. | ..xx..x. | ..x...x.',
    },
  ),
};

/** Beats for the drum kit: one drum at a time, like the tapped-out rock demo. */
export const KIT_SONGS: Readonly<Record<string, Chart>> = {
  'kit-disco': grooveChart(
    { title: 'Disco (kick on every beat)', artist: 'Lineup', bpm: 88, instruments: ['drum-kit'] },
    {
      kick: 'x.x.x.x. | x.x.x.x. | x.x.x.x. | x.x.x...',
      snare: '........ | ........ | ........ | ......x.',
      hat: '.x.x.x.x | .x.x.x.x | .x.x.x.x | .x.x.x.x',
    },
  ),
  'kit-shuffle': grooveChart(
    { title: 'Shuffle', artist: 'Lineup', bpm: 72, instruments: ['drum-kit'] },
    {
      kick: 'x.....x..... | x.....x..... | x.....x..... | x.....x.....',
      snare: '...x.....x.. | ...x.....x.. | ...x.....x.. | ...x.....x..',
      hat: '..x..x..x..x | ..x..x..x..x | ..x..x..x..x | ..x..x..x..x',
    },
    3,
  ),
  'kit-rock-fill': grooveChart(
    { title: 'Rock beat with a fill', artist: 'Lineup', bpm: 90, instruments: ['drum-kit'] },
    {
      kick: 'x...x... | x...x... | x...x... | x.......',
      snare: '..x...x. | ..x...x. | ..x...x. | .xxxxxxx',
      hat: '.x.x.x.x | .x.x.x.x | .x.x.x.x | ........',
    },
  ),
  'kit-halftime': grooveChart(
    { title: 'Half-time groove', artist: 'Lineup', bpm: 80, instruments: ['drum-kit'] },
    {
      kick: 'x.....x. | x.x...x. | x.....x. | x.x.....',
      snare: '....x... | ....x... | ....x... | ....x.xx',
      hat: '.xxx.x.x | .x.x.x.x | .xxx.x.x | .x.x.x..',
    },
  ),
  'kit-funk': grooveChart(
    { title: 'Funk groove (two bars)', artist: 'Lineup', bpm: 76, instruments: ['drum-kit'] },
    {
      kick: 'x..x.... | ..x.....',
      snare: '....x... | ....x..x',
      hat: '.xx..xx. | .x.x.x..',
    },
  ),
};

/** All the library's songs, in menu order for each profile (the order within each profile is kept). */
export const LIBRARY: Readonly<Record<string, Chart>> = {
  ...VOICE_SONGS,
  ...WIND_SONGS,
  ...STRUM_SONGS,
  ...CLAP_SONGS,
  ...HAND_SONGS,
  ...KIT_SONGS,
};
