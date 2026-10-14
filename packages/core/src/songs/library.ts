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
  /** Beats to the bar when not 4. */
  beatsPerBar?: number;
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
    beatsPerBar: 3,
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
    id: 'ode-to-joy',
    title: 'Ode to Joy',
    artist: 'Beethoven',
    bpm: 100,
    tonic: 60,
    notes: `E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 |
      E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2`,
  },
  {
    id: 'london-bridge',
    title: 'London Bridge',
    artist: 'Traditional',
    bpm: 112,
    tonic: 60,
    notes: `G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4 E4 F4:2 | E4 F4 G4:2 |
      G4:1.5 A4:.5 G4 F4 | E4 F4 G4:2 | D4 G4 E4 C4:2`,
  },
  {
    id: 'happy-birthday',
    title: 'Happy Birthday',
    artist: 'Hill / Hill',
    bpm: 96,
    tonic: 60,
    beatsPerBar: 3,
    voiceOnly: true,
    notes: `G3:.75 G3:.25 A3 G3 C4 B3:2 | G3:.75 G3:.25 A3 G3 D4 C4:2 |
      G3:.75 G3:.25 G4 E4 C4 B3 | A3 F4:.75 F4:.25 E4 C4 D4 C4:2`,
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
    id: 'old-macdonald',
    title: 'Old MacDonald',
    artist: 'Traditional',
    bpm: 108,
    tonic: 60,
    notes: `C4 C4 C4 G4 | A4 A4 G4:2 | E4 E4 D4 D4 | C4:4 |
      G4:.5 G4:.5 C4 C4 C4 | G4 A4 A4 G4:2 | E4 E4 D4 D4 | C4:4`,
  },
  {
    id: 'au-clair',
    title: 'Au clair de la lune',
    artist: 'Traditional',
    bpm: 96,
    tonic: 60,
    notes: `C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 |
      D4 D4 D4 D4 | A4:2 A4:2 | D4 C4 B3 A3 | G3:4 |
      C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4`,
    // a whistle or recorder cannot play below its tonic, so the middle is lifted
    windNotes: `C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4 |
      D4 D4 D4 D4 | A4:2 A4:2 | D4 C4 B4 A4 | G4:4 |
      C4 C4 C4 D4 | E4:2 D4:2 | C4 E4 D4 D4 | C4:4`,
  },
  {
    id: 'lightly-row',
    title: 'Lightly Row',
    artist: 'Traditional',
    bpm: 104,
    tonic: 60,
    notes: `G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 |
      G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4`,
  },
  {
    id: 'oh-susanna',
    title: 'Oh! Susanna',
    artist: 'Foster',
    bpm: 112,
    tonic: 60,
    notes: `C4:.5 D4:.5 | E4 G4 G4:1.5 A4:.5 | G4 E4 C4:.5 D4:.5 E4:.5 E4:.5 | D4 C4 D4:2 |
      C4:.5 D4:.5 | E4 G4 G4:1.5 A4:.5 | G4 E4 C4:.5 D4:.5 E4:.5 E4:.5 | D4 D4 C4:2`,
  },
  {
    id: 'yankee-doodle',
    title: 'Yankee Doodle',
    artist: 'Traditional',
    bpm: 116,
    tonic: 60,
    notes: `C4 C4 D4 E4 | C4 E4 D4 G3 | C4 C4 D4 E4 | C4:2 B3:2 |
      C4 C4 D4 E4 | F4 E4 D4 C4 | B3 G3 A3 B3 | C4:2 C4:2`,
    windNotes: `C4 C4 D4 E4 | C4 E4 D4 G4 | C4 C4 D4 E4 | C4:2 B4:2 |
      C4 C4 D4 E4 | F4 E4 D4 C4 | B4 G4 A4 B4 | C4:2 C4:2`,
  },
  {
    id: 'arpeggio-climb',
    title: 'Arpeggio Climb',
    artist: 'Lineup',
    bpm: 84,
    tonic: 60,
    notes: `C4 E4 G4 C5 | G4 E4 C4:2 | D4 F4 A4 D5 | A4 F4 D4:2 |
      E4 G4 B4 D5 | B4 G4 E4:2 | C4 E4 G4 C5 | C5:4`,
  },
  {
    id: 'chromatic-walk',
    title: 'Chromatic Walk',
    artist: 'Lineup',
    bpm: 80,
    tonic: 60,
    notes: `C4 C#4 D4 D#4 | E4 F4 F#4 G4 | G#4 A4 A#4 B4 | C5:4 |
      C5 B4 A#4 A4 | G#4 G4 F#4 F4 | E4 D#4 D4 C#4 | C4:4`,
  },
  {
    id: 'itsy-bitsy',
    title: 'Itsy Bitsy Spider',
    artist: 'Traditional',
    bpm: 108,
    tonic: 60,
    notes: `G3:.5 C4:1 C4:.5 C4:1 D4:.5 | E4:1.5 E4:.5 E4:1 D4:.5 C4:.5 | D4:1 E4:.5 C4:1.5 | r:.5 E4:.5 E4:.5 F4:1 F4:.5 |
      G4:1.5 G4:.5 F4:1 E4:.5 F4:.5 | G4:1 C4:1.5`,
    windNotes: `G4:.5 C4:1 C4:.5 C4:1 D4:.5 | E4:1.5 E4:.5 E4:1 D4:.5 C4:.5 | D4:1 E4:.5 C4:1.5 | r:.5 E4:.5 E4:.5 F4:1 F4:.5 |
      G4:1.5 G4:.5 F4:1 E4:.5 F4:.5 | G4:1 C4:1.5`,
  },
  {
    id: 'baa-baa',
    title: 'Baa, Baa, Black Sheep',
    artist: 'Traditional',
    bpm: 100,
    tonic: 60,
    notes: `C4 C4 G4 G4 | A4 B4 C5 A4 | G4:2 r | F4 F4 E4 E4 | D4 D4 C4:2`,
  },
  {
    id: 'scale-sprint',
    title: 'Scale Sprint',
    artist: 'Lineup',
    bpm: 96,
    tonic: 60,
    notes: `C4:.5 D4:.5 E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:.5 | C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:.5 D4:.5 C4:.5 |
      E4:.5 F4:.5 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 | D5:.5 C5:.5 B4:.5 A4:.5 G4:.5 F4:.5 E4:1 | C4:4`,
  },
  {
    id: 'three-steps',
    title: 'Three Steps Up',
    artist: 'Lineup',
    bpm: 88,
    tonic: 60,
    notes: `C4 E4 G4:2 | D4 F4 A4:2 | E4 G4 B4:2 | F4 A4 C5:2 | G4 E4 C4:4`,
  },
  {
    id: 'dusk-in-a',
    title: 'Dusk in A minor',
    artist: 'Lineup',
    bpm: 72,
    tonic: 60,
    notes: `A4:2 C5 B4 | A4:2 E4:2 | F4 A4 G4 E4 | A4:4 | C5:2 D5 C5 | D5:2 B4:2 | C5 B4 A4 G4 | A4:4`,
  },
  {
    id: 'leap-frog',
    title: 'Leap Frog',
    artist: 'Lineup',
    bpm: 104,
    tonic: 60,
    notes: `C4 G4 C4 G4 | D4 A4 D4 A4 | E4 B4 E4 B4 | F4 C5 F4 C5 | G4 D5 G4 D5 | C5:4`,
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
          ...(t.beatsPerBar ? { beatsPerBar: t.beatsPerBar } : {}),
        },
        wind && t.windNotes ? t.windNotes : t.notes,
        shift,
      ),
    ]),
  );
}

/** Songs to sing: written as above, from about G3 to F5. */
export const VOICE_SONGS: Readonly<Record<string, Chart>> = tunesFor('voice', 'sing', 0);

/** Songs for the keyboard: the same tunes as written, in the right hand (the voice-only ones included). */
export const KEY_TUNES: Readonly<Record<string, Chart>> = tunesFor('keyboard', 'keys', 0);

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
  'strum-rising-sun': strumChart(
    {
      title: 'House of the Rising Sun (Am C D F Am E)',
      artist: 'Traditional',
      bpm: 76,
      instruments: ['ukulele-strum'],
    },
    'Am | C | D | F | Am | C | E | E | Am | C | D | F | Am | E | Am | Am',
    'D . D . D U D .',
  ),
  'strum-three-chords-g': strumChart(
    {
      title: 'Campfire in G (G C D)',
      artist: 'Lineup',
      bpm: 100,
      instruments: ['ukulele-strum'],
    },
    'G | G | C | G | G | G | D | D | G | C | G | D | G | C | D | G',
    'D . D U . U D U',
  ),
  'strum-pop-axis': strumChart(
    {
      title: 'Pop progression (C G Am F)',
      artist: 'Lineup',
      bpm: 96,
      instruments: ['ukulele-strum'],
    },
    'C | G | Am | F | C | G | Am | F | C | G | F | F | C | G | F | C',
    'D . D U . U D U',
  ),
  'strum-sunny-day': strumChart(
    {
      title: 'Sunny day (D G A7)',
      artist: 'Lineup',
      bpm: 108,
      instruments: ['ukulele-strum'],
    },
    'D | D | G | D | D | D | A7 | A7 | D | G | D | A7 | D | G | A7 | D',
    'D . D U D U D U',
  ),
  'strum-minor-blues': strumChart(
    {
      title: 'Minor blues in A (Am Dm E7)',
      artist: 'Lineup',
      bpm: 84,
      instruments: ['ukulele-strum'],
    },
    'Am | Am | Am | Am | Dm | Dm | Am | Am | E7 | Dm | Am | E7',
    'D . D U . U D U',
  ),
  'strum-turnaround': strumChart(
    {
      title: 'Turnaround (C A7 D7 G7)',
      artist: 'Lineup',
      bpm: 92,
      instruments: ['ukulele-strum'],
    },
    'C | A7 | D7 | G7 | C | A7 | D7 | G7 | C | C7 | F | Dm | C | G7 | C | C',
    'D . D U D U D .',
  ),
  'strum-slow-waltz-g': strumChart(
    {
      title: 'Slow waltz in G (G Em C D)',
      artist: 'Lineup',
      bpm: 88,
      instruments: ['ukulele-strum'],
    },
    'G | Em | C | D | G | Em | C | D | G | Bm | C | D | G | C | D | G',
    'D . D U D .',
    { beatsPerBar: 3 },
  ),
  'strum-fiddle-tune': strumChart(
    {
      title: 'Fiddle tune (G C D Em)',
      artist: 'Lineup',
      bpm: 112,
      instruments: ['ukulele-strum'],
    },
    'G | G | C | G | G | Em | D | D | G | C | G | Em | C | D | G | G',
    'D . D U . U D U',
  ),
  'strum-hymn-c': strumChart(
    {
      title: 'Hymn in C (C F G Am)',
      artist: 'Lineup',
      bpm: 80,
      instruments: ['ukulele-strum'],
    },
    'C | F | C | G | Am | F | G | C | C | F | C | G | Am | Dm | G | C',
    'D . . U D . . U',
  ),
  'strum-rain-day': strumChart(
    {
      title: 'Rainy day (Am F C G)',
      artist: 'Lineup',
      bpm: 90,
      instruments: ['ukulele-strum'],
    },
    'Am | F | C | G | Am | F | C | G | Am | F | G | E | Am | F | E | Am',
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
    {
      title: 'Clap: waltz (three beats a bar)',
      artist: 'Lineup',
      bpm: 100,
      instruments: ['clap'],
      beatsPerBar: 3,
    },
    { hit: 'x.x.x. | x.x.x. | x.x.xx | x.x.x.' },
  ),
  'clap-triplet-swing': grooveChart(
    { title: 'Clap: swing', artist: 'Lineup', bpm: 80, instruments: ['clap'] },
    { hit: 'x..x.xx..x.x | x..x.xx..x.x | x..x.xx..x.x | x.xx.xx.....' },
    3,
  ),
  'clap-sixteenths': grooveChart(
    { title: 'Clap: running sixteenths', artist: 'Lineup', bpm: 76, instruments: ['clap'] },
    { hit: 'xxxxx.x. | x.xxxxxx | xxxxx.x. | x.x.x.x.' },
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
  'hand-pulse-and-offbeat': grooveChart(
    {
      title: 'Clap & tap: pulse and offbeat',
      artist: 'Lineup',
      bpm: 92,
      instruments: ['hand-percussion'],
    },
    {
      clap: 'x...x... | x...x... | x...x... | x...x.x.',
      tap: '.x.x.x.x | .x.x.x.x | .x.x.x.x | .x.x.x..',
    },
  ),
  'hand-conversation': grooveChart(
    {
      title: 'Clap & tap: conversation',
      artist: 'Lineup',
      bpm: 84,
      instruments: ['hand-percussion'],
    },
    {
      clap: 'x.x.x.x. | ........ | x.xxx.x. | ........',
      tap: '........ | x.x.x.x. | ........ | x.xxxxx.',
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
  'kit-bossa': grooveChart(
    { title: 'Bossa nova', artist: 'Lineup', bpm: 78, instruments: ['drum-kit'] },
    {
      kick: 'x...x... | x..x.... | x...x... | x.......',
      snare: '...x..x. | ....x.x. | ...x..x. | ...x.x.x',
      hat: '.xx..x.x | .xx..x.x | .xx..x.x | .xx.x.x.',
    },
  ),
  'kit-double-time': grooveChart(
    { title: 'Double-time rock', artist: 'Lineup', bpm: 72, instruments: ['drum-kit'] },
    {
      kick: 'x...x.x. | x...x.x. | x...x.x. | x.x.....',
      snare: '..x....x | ..x....x | ..x....x | ...x.xxx',
      hat: '.x.x.x.. | .x.x.x.. | .x.x.x.. | .x..x...',
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

/** One song for the pentatonic flutes, written in C (the tonic of the major scale holding its notes). */
interface FluteTune {
  id: string;
  title: string;
  bpm: number;
  notes: string;
}

/**
 * Original songs for the pentatonic flutes (a Native American flute, a shakuhachi): slow phrases of
 * long held notes with a breath between them, using only the five notes of the scale, easiest
 * first. Written in the major tonic C5 like every wind song, so an A minor flute plays them as
 * written, its lowest note the A below. The first four are in the minor mood and end on that A;
 * the major mood ends on the C above it.
 */
const FLUTE_TUNES: readonly FluteTune[] = [
  {
    id: 'first-breath',
    title: 'First Breath',
    bpm: 52,
    notes: `A4:4 r:2 | C5:4 r:2 | A4:2 C5:2 D5:4 r:2 | C5:2 A4:2 C5:4 r:2 | D5:2 C5:2 A4:6`,
  },
  {
    id: 'two-stones',
    title: 'Two Stones',
    bpm: 52,
    notes: `A4:2 E5:4 r:2 | A4:2 E5:2 D5:2 C5:2 r:2 | A4:2 C5:2 E5:4 r:2 | D5:2 C5:2 A4:6`,
  },
  {
    id: 'morning-ridge',
    title: 'Morning Ridge',
    bpm: 56,
    notes: `C5:4 r:2 | D5:2 E5:2 G5:4 r:2 | E5:2 D5:2 C5:4 r:2 | G5:2 A5:2 G5:2 E5:2 | D5:2 C5:2 C5:6`,
  },
  {
    id: 'river-song',
    title: 'River Song',
    bpm: 60,
    notes: `A4:2 C5:1 D5:1 E5:4 r:2 | E5:2 D5:1 C5:1 D5:4 r:2 | A4:2 C5:1 D5:1 E5:2 G5:2 r:2 |
      G5:2 E5:2 D5:2 C5:2 | A4:8`,
  },
  {
    id: 'heron-at-dusk',
    title: 'Heron at Dusk',
    bpm: 60,
    notes: `E5:4 r:1 D5:1 C5:2 | A4:3 r:1 C5:2 D5:2 | E5:2 G5:2 E5:4 | D5:2 C5:2 A4:6 r:2 |
      C5:2 D5:2 E5:2 G5:2 | A5:4 G5:2 E5:2 | D5:2 C5:2 A4:8`,
  },
  {
    id: 'canyon-echo',
    title: 'Canyon Echo',
    bpm: 66,
    notes: `A4:2 C5:2 E5:4 | A5:2 G5:2 E5:4 r:2 | A4:2 C5:2 E5:4 | C6:2 A5:2 G5:4 r:2 |
      E5:2 D5:2 C5:2 A4:2 | A4:8`,
  },
  {
    id: 'rain-on-the-mesa',
    title: 'Rain on the Mesa',
    bpm: 76,
    notes: `A4:.5 C5:.5 D5:.5 E5:.5 G5:1 E5:1 | D5:.5 E5:.5 D5:.5 C5:.5 A4:2 |
      C5:.5 D5:.5 E5:.5 G5:.5 A5:1 G5:1 | E5:.5 D5:.5 C5:.5 D5:.5 E5:2 |
      G5:.5 A5:.5 G5:.5 E5:.5 D5:1 C5:1 | A4:4`,
  },
  {
    id: 'eagle-song',
    title: 'Eagle Song',
    bpm: 72,
    notes: `A4:1 E5:1 A5:2 | G5:1 E5:1 C5:2 | D5:.5 E5:.5 G5:1 A5:2 | C6:2 A5:1 G5:1 |
      E6:2 D6:1 C6:1 | A5:1 G5:1 E5:2 | D5:1 C5:1 A4:2 | A4:4`,
  },
  {
    id: 'cedar-wind',
    title: 'Cedar Wind',
    bpm: 58,
    notes: `C5:4 D5:2 E5:2 | G5:4 r:2 | E5:2 D5:2 C5:4 | A4:6 r:2 | C5:2 E5:2 G5:2 A5:2 | G5:4 E5:4 | D5:2 C5:2 A4:8`,
  },
  {
    id: 'night-fire',
    title: 'Night Fire',
    bpm: 54,
    notes: `A4:4 C5:2 D5:2 | E5:6 r:2 | D5:2 C5:2 A4:4 | C5:2 D5:2 E5:4 | G5:4 E5:2 D5:2 | C5:2 A4:2 A4:6`,
  },
  {
    id: 'geese-overhead',
    title: 'Geese Overhead',
    bpm: 68,
    notes: `E5:1 G5:1 A5:2 G5:1 E5:1 D5:2 | C5:1 D5:1 E5:2 G5:2 r:2 | A5:1 C6:1 D6:2 C6:1 A5:1 G5:2 | E5:2 D5:2 C5:4 | A4:8`,
  },
  {
    id: 'thunder-drum',
    title: 'Thunder Drum',
    bpm: 80,
    notes: `A4:.5 A4:.5 C5:1 E5:.5 E5:.5 G5:1 | A5:1 G5:1 E5:2 | D5:.5 E5:.5 G5:.5 E5:.5 D5:1 C5:1 | A4:4 |
      C5:.5 D5:.5 E5:.5 G5:.5 A5:.5 G5:.5 E5:1 | D5:.5 C5:.5 D5:.5 E5:.5 C5:2 | A4:.5 C5:.5 D5:.5 E5:.5 G5:1 E5:1 | A4:4`,
  },
];

/** The flute songs by id (`flute-<name>`), for the wind profile in the tonic C5. */
export const FLUTE_SONGS: Readonly<Record<string, Chart>> = Object.fromEntries(
  FLUTE_TUNES.map((t) => [
    `flute-${t.id}`,
    melodyChart(
      { title: t.title, artist: 'Lineup', bpm: t.bpm, instruments: ['wind'], tonic: 72 },
      t.notes,
    ),
  ]),
);
