import type { PopSong } from './pop';

/**
 * Well-known songs after the years of the Billboard annotations, as the chords people play them with:
 * the main progression of each, simplified to chords with fingerings and looped for a few verses and
 * choruses. Written by hand, so check one against the recording before relying on it. Chord sequences
 * are facts about a song; there is no melody and no text. `year` is the release year and `peak` is 99
 * (the chart position is not recorded for these).
 */
export const loop = (bars: string, times: number): string => Array(times).fill(bars).join(' | ');

export const song = (
  title: string,
  artist: string,
  year: number,
  bpm: number,
  bars: string,
  extra: Partial<PopSong> = {},
): PopSong => ({
  title,
  artist,
  year,
  peak: 99,
  beatsPerBar: 4,
  steps: 2,
  bpm,
  capo: 0,
  up: 0,
  bars,
  ...extra,
});

export const POP_MODERN: readonly PopSong[] = [
  song('Someone Like You', 'Adele', 2011, 67, loop('A | E | F#m | D', 8)),
  song("I'm Yours", 'Jason Mraz', 2008, 76, loop('G | D | Em | C', 8), { capo: 4 }),
  song('Riptide', 'Vance Joy', 2013, 102, loop('Am | G | C | C', 8), { capo: 3 }),
  song('Hey, Soul Sister', 'Train', 2009, 97, loop('C | G | Am | F', 8), { capo: 4 }),
  song('Wonderwall', 'Oasis', 1995, 87, loop('Em | G | D | A', 8), { capo: 2 }),
  song('Let Her Go', 'Passenger', 2012, 75, loop('Am | F | C | G', 8)),
  song('No Woman, No Cry', 'Bob Marley & The Wailers', 1974, 78, loop('C | G | Am | F', 8)),
  song('Zombie', 'The Cranberries', 1994, 84, loop('Em | C | G | D', 8)),
  song('Good Riddance (Time of Your Life)', 'Green Day', 1997, 94, loop('G | C | D | D', 8)),
  song('Count on Me', 'Bruno Mars', 2010, 88, loop('C | Em | F | Am', 8)),
  song('All of Me', 'John Legend', 2013, 63, loop('Em | C | G | D', 8), { capo: 1 }),
  song('Despacito', 'Luis Fonsi & Daddy Yankee', 2017, 89, loop('Bm | G | D | A', 8)),
  song('Wagon Wheel', 'Old Crow Medicine Show', 2004, 148, loop('G | D | Em | C', 8), {
    capo: 2,
  }),
  song('Viva la Vida', 'Coldplay', 2008, 138, loop('C | D | G | Em', 8), { capo: 1 }),
  song('Hallelujah', 'Leonard Cohen', 1984, 56, loop('C | Am | C | Am | F | G | C | G', 3), {
    steps: 3,
  }),
  song('Thinking Out Loud', 'Ed Sheeran', 2014, 79, loop('D | D | G | A', 8)),
  song('Perfect', 'Ed Sheeran', 2017, 63, loop('G | Em | C | D', 8), { capo: 1, steps: 3 }),
  song('Hello', 'Adele', 2015, 79, loop('Em | C | G | D', 8), { capo: 1 }),
  song("Don't Look Back in Anger", 'Oasis', 1995, 82, loop('C | G | Am | E | F | G | C | C', 3)),
  song('Ho Hey', 'The Lumineers', 2012, 80, loop('C | F | Am | G', 8)),
  song(
    'Hey There Delilah',
    "Plain White T's",
    2006,
    104,
    loop('D | F#m | D | F#m | Bm | G | A | A', 3),
  ),
  song('Mad World', 'Gary Jules', 2001, 72, loop('Em | G | D | A', 8)),
];
