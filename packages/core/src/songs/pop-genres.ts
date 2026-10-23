import type { PopSong } from './pop';
import { loop, song } from './pop-modern';

/**
 * Chords of jazz and blues standards and of classical and early-music progressions, to strum. Written by
 * hand from the harmonies players know: sevenths, extensions and diminished chords are simplified to the
 * chords Strumline has fingerings for, so these are outlines, not lead sheets. The classical ones are the
 * old patterns every composer used (the folia, the romanesca, the canon) and are in the public domain;
 * for the standards only the chord sequence is given: no melody and no text. `year` is when the piece or
 * the tune dates from, roughly, and `peak` is 99 (these were not charted).
 */
export const POP_GENRES: readonly (PopSong & { genre: PopGenre })[] = [
  withGenre(
    'jazz',
    song(
      'Autumn Leaves',
      'Jazz standard (Joseph Kosma)',
      1945,
      110,
      loop('Am | D7 | G | C | F#m | B7 | Em | Em', 2) + ' | F#m | B7 | Em | Em',
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Fly Me to the Moon',
      'Jazz standard (Bart Howard)',
      1954,
      120,
      'Am | Dm | G7 | C | F | Bm | E7 | Am A7 | Dm | G7 | C | A7 | Dm | G7 | C | G7',
    ),
  ),
  withGenre(
    'jazz',
    song(
      'All of Me',
      'Jazz standard (Marks and Simons)',
      1931,
      130,
      'C | C | E7 | E7 | A7 | A7 | Dm | Dm | E7 | E7 | Am | Am | D7 | D7 | Dm G7 | C',
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Rhythm changes in C (the "I Got Rhythm" form)',
      'Jazz form',
      1930,
      170,
      'C Am | Dm G7 | C Am | Dm G7 | C | C7 | F | F | C Am | Dm G7 | C | G7 | E7 | E7 | A7 | A7 | D7 | D7 | G7 | G7 | C Am | Dm G7 | C | C',
    ),
  ),
  withGenre(
    'blues',
    song(
      '12-bar blues in E (E A B7)',
      'Blues form',
      1930,
      100,
      'E | A | E | E7 | A | A | E | E | B7 | A | E | B7',
    ),
  ),
  withGenre(
    'blues',
    song(
      'Quick-change blues in A (A D E7)',
      'Blues form',
      1930,
      108,
      'A | D | A | A | D | D | A | A | E7 | D | A | E7',
    ),
  ),
  withGenre(
    'classical',
    song(
      'Canon in D (the ground, in four-beat bars)',
      'Pachelbel',
      1680,
      96,
      loop('D A | Bm F#m | G D | G A', 4),
    ),
  ),
  withGenre(
    'classical',
    song(
      'La Folia (Baroque variations)',
      'Traditional (Iberian)',
      1500,
      88,
      loop('Dm | A | Dm | C | F | C | Dm A | Dm', 4),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'classical',
    song(
      'Romanesca (Renaissance ground)',
      'Traditional (Italian)',
      1550,
      92,
      loop('F | C | Dm | A | F | C | Dm A | Dm', 4),
    ),
  ),
  withGenre(
    'classical',
    song(
      'Passamezzo antico (Renaissance dance)',
      'Traditional (Italian)',
      1550,
      100,
      loop('Dm | C | Dm | A | F | C | Dm A | Dm', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'ii-V-I in C (jazz cadence)',
      'Jazz standard pattern',
      1940,
      90,
      loop('Dm | G7 | C | C', 8),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'I-vi-ii-V turnaround (jazz)',
      'Jazz standard pattern',
      1940,
      100,
      loop('C | Am | Dm | G7', 8),
    ),
  ),
  withGenre(
    'blues',
    song(
      'Minor blues in A',
      'Blues form',
      1950,
      90,
      loop('Am | Am | Am | Am | Dm | Dm | Am | Am | E7 | Dm | Am | E7', 3),
    ),
  ),
  withGenre(
    'classical',
    song(
      'Andalusian cadence (flamenco)',
      'Traditional (Spanish)',
      1600,
      90,
      loop('Am | G | F | E', 8),
    ),
  ),
  withGenre(
    'classical',
    song(
      'Circle of fifths (Baroque sequence)',
      'Baroque pattern',
      1700,
      80,
      loop('Am | Dm | G | C | F | Bm | E7 | Am', 4),
    ),
  ),
];

export type PopGenre = 'jazz' | 'blues' | 'classical';

function withGenre(genre: PopGenre, s: PopSong): PopSong & { genre: PopGenre } {
  return { ...s, genre };
}
