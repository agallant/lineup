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
  withGenre(
    'jazz',
    song(
      'Blue Bossa',
      'Kenny Dorham',
      1963,
      130,
      loop(
        'Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7 | Cm7 | Cm7 | Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7 | Cm7 | Cm7',
        2,
      ),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'The Girl from Ipanema',
      'Antonio Carlos Jobim',
      1962,
      128,
      loop('Fmaj7 | Fmaj7 | G7 | G7 | Gm7 | Gb7 | Fmaj7 | Gb7', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Summertime',
      'George Gershwin',
      1935,
      66,
      loop('Am | E7 | Am | E7 | Dm | Dm | Am | E7 | Am | Am', 3),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Giant Steps',
      'John Coltrane',
      1960,
      140,
      loop(
        'Bmaj7 D7 | Gmaj7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 Bb7 | Ebmaj7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | Am7 D7 | Gmaj7 | C#m7 F#7 | Bmaj7 | Fm7 Bb7 | Ebmaj7 | C#m7 F#7',
        2,
      ),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'So What',
      'Miles Davis',
      1959,
      136,
      loop(
        'Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Ebm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7 | Dm7',
        1,
      ),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Freddie Freeloader',
      'Miles Davis',
      1959,
      120,
      loop('Bb7 | Bb7 | Bb7 | Bb7 | Eb7 | Eb7 | Bb7 | Bb7 | F7 | Eb7 | Bb7 | Bb7', 3),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Mr. P.C.',
      'John Coltrane',
      1959,
      160,
      loop('Cm7 | Cm7 | Cm7 | Cm7 | Fm7 | Fm7 | Cm7 | Cm7 | Ab7 | G7 | Cm7 | G7', 3),
    ),
  ),
  withGenre(
    'jazz',
    song(
      "Billie's Bounce (bebop blues in F)",
      'Charlie Parker',
      1945,
      180,
      loop('F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | D7 | Gm7 | C7 | F7 D7 | Gm7 C7', 3),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Blues for Alice',
      'Charlie Parker',
      1951,
      160,
      loop(
        'Fmaj7 | Em7b5 A7 | Dm7 G7 | Cm7 F7 | Bb7 | Bbm7 Eb7 | Am7 | Abm7 Db7 | Gm7 | C7 | Fmaj7 D7 | Gm7 C7',
        3,
      ),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'All the Things You Are',
      'Jerome Kern',
      1939,
      120,
      loop(
        'Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dm7 G7 | Cmaj7 | Cmaj7 | Cm7 | Fm7 | Bb7 | Ebmaj7 | Abmaj7 | Am7 D7 | Gmaj7 | Gmaj7',
        2,
      ),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Satin Doll',
      'Duke Ellington',
      1953,
      120,
      loop('Dm7 G7 | Dm7 G7 | Em7 A7 | Em7 A7 | Am7 D7 | Abm7 Db7 | Dm7 G7 | C6', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Misty',
      'Erroll Garner',
      1954,
      66,
      loop('Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7 | Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Take the A Train',
      'Billy Strayhorn',
      1941,
      170,
      loop('C6 | C6 | D7 | D7 | Dm7 | G7 | C6 | Dm7 G7', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Sweet Georgia Brown',
      'Ben Bernie',
      1925,
      200,
      loop('E7 | E7 | A7 | A7 | D7 | D7 | G | G', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Minor Swing',
      'Django Reinhardt',
      1937,
      200,
      loop('Am | Am | Dm | Dm | E7 | E7 | Am | Am | Dm | Dm | E7 | E7 | Am | E7 | Am | Am', 2),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Watermelon Man',
      'Herbie Hancock',
      1962,
      112,
      loop('F7 | F7 | F7 | F7 | Bb7 | Bb7 | F7 | F7 | C7 | Bb7 | F7 | F7', 3),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'My Funny Valentine',
      'Richard Rodgers',
      1937,
      60,
      loop('Cm | Cm | Cm7 | Cm6 | Abmaj7 | Fm7 | Dm7b5 G7 | Cm', 4),
    ),
  ),
  withGenre(
    'jazz',
    song(
      'When the Saints Go Marching In (Dixieland)',
      'Traditional',
      1896,
      140,
      loop('C | C | C | C | F | F | C | C | C | G7 | C | C', 3),
    ),
  ),
  withGenre('christmas', song('Last Christmas', 'Wham!', 1984, 108, loop('D | Bm | Em | A', 8))),
  withGenre(
    'christmas',
    song(
      'Silent Night',
      'Traditional (Franz Gruber)',
      1818,
      76,
      loop('G | G | G | G | C | C | G | G | D7 | D7 | G | G', 2),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'christmas',
    song(
      'Away in a Manger',
      'Traditional',
      1885,
      84,
      loop('G | G7 | C | G | D | C | G | G | G | G7 | C | G | D7 | G | Am | D7', 2),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'christmas',
    song(
      'It Came Upon the Midnight Clear',
      'Traditional',
      1849,
      80,
      loop('C | F | C | D7 | G7 | C | F | C | G7 | C | E7 | Am | G | D7 | G | C', 2),
    ),
  ),
  withGenre(
    'christmas',
    song('Up on the Housetop', 'Traditional', 1864, 120, loop('F C | G7 C | C F | C G7', 4)),
  ),
  withGenre(
    'christmas',
    song('The First Noel', 'Traditional', 1833, 76, loop('G | D | C | G | C | G | C D | G', 3), {
      beatsPerBar: 3,
    }),
  ),
  withGenre(
    'christmas',
    song(
      'All I Want for Christmas Is You',
      'Mariah Carey',
      1994,
      150,
      loop('G B7 | Em Eb6 | G E7 | Am7 Cm6 | G Em | Am7 D', 4),
    ),
  ),
  withGenre('world', song('La Bamba', 'Ritchie Valens', 1958, 150, loop('C | F | G | F', 8))),
  withGenre('world', song('Oye Como Va', 'Tito Puente', 1962, 122, loop('Am7 | D7', 16))),
  withGenre(
    'world',
    song(
      'Guantanamera',
      'Traditional (Cuba)',
      1929,
      120,
      loop('C | G7 | C | G7 | C | F | G7 | C', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Kalinka',
      'Traditional (Russia)',
      1860,
      128,
      loop('Am | E | Am | E | Am | E | Am | Am', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Sakura Sakura',
      'Traditional (Japan)',
      1888,
      76,
      loop('Am | E7 | Am | Dm | Am | E7 | Dm | Am', 4),
    ),
  ),
  withGenre(
    'world',
    song('Hevenu Shalom Aleichem', 'Traditional (Israel)', 1970, 120, loop('Dm | Gm | A7 | Dm', 8)),
  ),
  withGenre(
    'world',
    song(
      'Hava Nagila',
      'Traditional (Israel)',
      1918,
      140,
      loop('Dm | Dm | A7 | A7 | Dm | Gm | A7 | Dm', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Cielito Lindo',
      'Traditional (Mexico)',
      1882,
      110,
      loop('C | G7 | C | G7 | C | F | C | G7 | C', 3),
    ),
  ),
  withGenre(
    'world',
    song(
      'Scarborough Fair',
      'Traditional (England)',
      1670,
      84,
      loop('Am | C | G | Am | C | D | Am | C | G | Am | G | Em | Am', 3),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'world',
    song(
      'Amazing Grace',
      'John Newton',
      1779,
      76,
      loop('G | G | C | G | G | Em | D | D | G | G7 | C | G | G | D | G | G', 2),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'world',
    song(
      'Loch Lomond',
      'Traditional (Scotland)',
      1841,
      84,
      loop('C | Am | F | G | F | Am | Dm | F | G7 | C | Am | Dm | G | C | C | C', 2),
    ),
  ),
  withGenre(
    'world',
    song(
      'The Wild Rover',
      'Traditional (Ireland)',
      1850,
      120,
      loop('G | C | G | D | G | C | G | D | G', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Molly Malone',
      'Traditional (Ireland)',
      1883,
      100,
      loop('C | Am | Dm | G | C | Em | Dm G | C | Am | Dm | G | C | Em C | G C', 2),
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'world',
    song(
      'Danny Boy',
      'Traditional (Ireland)',
      1913,
      72,
      loop('C | C7 | F | Fm | C | Am | D7 | G | C | C7 | F | Fm | C | Am | Dm G | C', 2),
    ),
  ),
  withGenre(
    'world',
    song(
      'Auld Lang Syne',
      'Traditional (Scotland)',
      1788,
      88,
      loop('G | D | Em | C | G | D | Em | C | G', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Swing Low, Sweet Chariot',
      'Traditional (spiritual)',
      1870,
      80,
      loop('D | G | D | A7 | D7 | G | D | A7 | D', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Jamaica Farewell',
      'Harry Belafonte',
      1956,
      108,
      loop('G | C | G | D7 | G | C | G | D7 | G', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Many Rivers to Cross',
      'Jimmy Cliff',
      1969,
      68,
      loop('G | Bm | C | Bm | C | D | G | G', 4),
    ),
  ),
  withGenre(
    'world',
    song(
      'Puff, the Magic Dragon',
      'Peter, Paul and Mary',
      1963,
      100,
      loop('G | Bm | C | G | C | G | Em | A7 | D7 | G', 3),
    ),
  ),
  withGenre(
    'blues',
    song(
      'Blue Yodel No. 1 (T for Texas)',
      'Jimmie Rodgers',
      1927,
      104,
      'C | C | C | C | F | F | C | C | G7 | F | C | G7',
    ),
  ),
  withGenre(
    'blues',
    song(
      'The Thrill Is Gone',
      'B.B. King',
      1969,
      90,
      'Bm | Bm7 | Bm | Bm7 | Em | Em7 | Bm | Bm7 | Gmaj7 | F#7 | Bm | Bm',
    ),
  ),
  withGenre(
    'blues',
    song(
      'Born Under a Bad Sign',
      'Albert King',
      1967,
      100,
      'D7 | D7 | D7 | D7 | G7 | G7 | D7 | D7 | A7 | G7 | D7 | A7',
    ),
  ),
  withGenre(
    'blues',
    song('Pride and Joy', 'Stevie Ray Vaughan', 1983, 118, 'E | E7 | A | E7 | B7 | A7 | E | B7'),
  ),
  withGenre(
    'christmas',
    song(
      'Fairytale of New York',
      'The Pogues',
      1987,
      92,
      'C | F | C | G | C | F | C | G | C | C | G | Am | F | C | G | C | Am | C | F | C | G | C | G | C | F | G | C | Am | C | F | C | G | C',
      { capo: 2 },
    ),
  ),
  withGenre(
    'world',
    song(
      'Whiskey in the Jar',
      'Traditional Irish (The Dubliners)',
      1967,
      128,
      'C | Am | F | C | G | C | Am | F | C | G | C | F | C | G | C',
    ),
  ),
  withGenre(
    'christmas',
    song(
      'The Christmas Song',
      'Nat King Cole',
      1946,
      66,
      'Cmaj7 | Dm7 | Em7 | Fmaj7 | Cmaj7 | Gm7 | C7 | Fmaj7 | Bb7 | Am | Fm6 | Cmaj7 | B7 | Em7 | Fm7 | Dm7 | G7',
    ),
  ),
  withGenre(
    'christmas',
    song(
      "Rockin' Around the Christmas Tree",
      'Brenda Lee',
      1958,
      130,
      'G | D7 | Am7 | D7 | G | C | Bm | Em7 | A7 | D7 | G | D7 | Am7 | D7 | G | Em | C | D | G',
    ),
  ),
  withGenre(
    'christmas',
    song(
      'Jingle Bell Rock',
      'Bobby Helms',
      1957,
      120,
      'D | Dmaj7 | D6 | D | D6 | D | Em | A7 | Em | A7 | Em | A7 | A | Em | A7 | D | G | Gm | D | D7 | E | E7 | A | A7 | D | B7 | G | Gm | E7 | Gm | Em | A | A7 | D',
    ),
  ),
  withGenre(
    'jazz',
    song(
      'Corcovado',
      'Antonio Carlos Jobim',
      1960,
      120,
      'Am6 | E | Gm7 | C7 | Fdim | F6 | Fm7 | Bb7 | E7 | A7 | Am7 | Fm6 | G7 | Fm6',
    ),
  ),
  withGenre(
    'world',
    song(
      'Waltzing Matilda',
      'Traditional Australian',
      1895,
      100,
      'G | D7 | G | C | G | A | D | C | G | Am | D | G | D7 | G | C | G | A | A7 | D | D7 | G | D7 | G | C | G | Am | D | G',
    ),
  ),
  withGenre(
    'christmas',
    song(
      'Jingle Bells',
      'James Lord Pierpont',
      1857,
      120,
      'C | C | C | C | C | C | C | C | F | F | C | C | G7 | G7 | C | C',
    ),
  ),
  withGenre(
    'christmas',
    song('Deck the Halls', 'Traditional Welsh', 1784, 110, 'C | G7 | C | G7 | C | F | C | G7 | C'),
  ),
  withGenre(
    'christmas',
    song(
      'We Wish You a Merry Christmas',
      'Traditional English',
      1935,
      110,
      'C | F | D7 | G | E7 | Am | D7 | G | C | F | C | G7 | C',
      { beatsPerBar: 3 },
    ),
  ),
  withGenre(
    'christmas',
    song(
      'Joy to the World',
      'Isaac Watts and Lowell Mason',
      1839,
      100,
      'C | C | G | C | F | C | G | C | C | C | G | C',
    ),
  ),
  withGenre(
    'christmas',
    song(
      'O Come, All Ye Faithful',
      'John Francis Wade',
      1743,
      92,
      'G | D | G | D | G | D | G | C | G | D | G | D | G | D | G',
    ),
  ),
  withGenre(
    'christmas',
    song(
      'Hark! The Herald Angels Sing',
      'Mendelssohn and Wesley',
      1840,
      92,
      'F | C | F | C | F | Bb | F | C | F | Dm | C | F',
    ),
  ),
  withGenre(
    'world',
    song(
      'Bamboleo',
      'Gipsy Kings',
      1987,
      120,
      'Em | B7 | Em | B7 | Em | Am6 | B7 | Em | Em | Am6 | B7 | Em | Am7 | D7 | Gmaj7 | C | Am | B7 | Em',
    ),
  ),
  withGenre(
    'world',
    song(
      'Volare',
      'Gipsy Kings',
      1989,
      130,
      'E | F#m | E | G#m | F#m | C#m | B7 | F#m | B7 | E | C#m | F#m | B7 | E',
    ),
  ),
  withGenre(
    'world',
    song(
      'Mas Que Nada',
      'Jorge Ben Jor',
      1963,
      110,
      'Gm | Cm7 | Dm7 | Gm | C#dim | Gm | Cm7 | Gm | D7 | Gm | Cm7 | F | Gm | Cm7 | F | Gm',
    ),
  ),
  withGenre(
    'jazz',
    song(
      'What a Wonderful World',
      'Louis Armstrong',
      1967,
      70,
      'C | Em | F | Em | Dm | C | E7 | Am | Ab | Dm7 | G | C | G | C | Am | Em | Am | Em | Dm | C | G',
    ),
  ),
];

export type PopGenre = 'jazz' | 'blues' | 'classical' | 'christmas' | 'world';

function withGenre(genre: PopGenre, s: PopSong): PopSong & { genre: PopGenre } {
  return { ...s, genre };
}
