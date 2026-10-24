import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { GUITAR_BARRE_FORMS } from '../chord-shapes';
import { ROOT_NAMES } from '../chord-theory';
import { GUITAR_STANDARD } from '../guitar';
import { strumChart } from '../songs/notation';

const DOWNS = 'D . D . D . D .';
const SHUFFLE = 'D . D U . U D U';
const ukulele = ['ukulele-strum'];

/** Roots in the order of the circle of fifths, the way keys are usually met. */
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const name = (root: number, quality: string): string => `${ROOT_NAMES[root % 12]}${quality}`;

/** A chord held a bar at a time, strummed four down-strokes to the bar. */
const walk = (id: string, title: string, bars: string, bpm: number): [string, Chart] => [
  id,
  strumChart({ title, artist: 'Lineup', bpm, instruments: ukulele }, bars, DOWNS),
];

/** Twelve-bar blues in a key: I7 for four bars, IV7 two, I7 two, V7 IV7 I7 V7. */
function bluesBars(root: number): string {
  const [one, four, five] = [name(root, '7'), name(root + 5, '7'), name(root + 7, '7')];
  return [one, one, one, one, four, four, one, one, five, four, one, five].join(' | ');
}

/** A chord held four beats at a time in a shape that slides: the frets are the open shape plus the slide. */
function slide(
  id: string,
  title: string,
  profile: string,
  shape: readonly (number | null)[],
  rootOf: (k: number) => number,
  quality: string,
  slides: readonly number[],
  bpm = 60,
): [string, Chart] {
  const notes: BeatNote[] = [];
  slides.forEach((k, bar) => {
    const frets = shape.map((f) => (f === null ? null : f + k));
    const chord = name(rootOf(k), quality);
    for (let i = 0; i < 4; i++) {
      notes.push({
        beat: bar * 4 + i,
        lane: 'down',
        expected: { chord, direction: 'down', frets },
      });
    }
  });
  return [id, chartFromBeats({ title, artist: 'Lineup', bpm, instruments: [profile] }, notes)];
}

/**
 * Practice for the chords beyond the first dozen: every major, minor and seventh chord, blues in
 * every key, the colour chords, and one shape slid up the neck to make a new chord at each fret.
 * The ids are `ex-ukulele-strum-<name>` (and `ex-guitar-strum-<name>` for the guitar's own).
 */
export function chordPracticeExercises(): Record<string, Chart> {
  const rows: [string, Chart][] = [
    walk(
      'ex-ukulele-strum-all-major',
      'Every major chord',
      FIFTHS.map((r) => name(r, '')).join(' | '),
      64,
    ),
    walk(
      'ex-ukulele-strum-all-minor',
      'Every minor chord',
      FIFTHS.map((r) => name(r, 'm')).join(' | '),
      64,
    ),
    walk(
      'ex-ukulele-strum-all-seventh',
      'Every seventh chord',
      FIFTHS.map((r) => name(r, '7')).join(' | '),
      64,
    ),
    walk(
      'ex-ukulele-strum-colour-sus',
      'Suspended chords: D, A and G',
      'D | Dsus4 | D | Dsus2 | A | Asus4 | A | Asus2 | G | Gsus4 | G | Gsus2',
      70,
    ),
    walk(
      'ex-ukulele-strum-colour-sevenths',
      'Sevenths: major, dominant and minor',
      'C | Cmaj7 | C7 | Cm7 | F | Fmaj7 | F7 | Fm7 | G | Gmaj7 | G7 | Gm7',
      66,
    ),
    walk(
      'ex-ukulele-strum-colour-turnaround',
      'Jazz turnaround with sevenths',
      'Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7',
      76,
    ),
    walk(
      'ex-ukulele-strum-colour-slash',
      'Walking down the bass: C, G/B, Am, Am/G, F',
      'C | G/B | Am | Am/G | F | C/E | Dm | G | C',
      72,
    ),
  ];
  for (const root of FIFTHS) {
    const key = ROOT_NAMES[root]!;
    rows.push([
      `ex-ukulele-strum-blues-${key.toLowerCase().replace('#', 's')}`,
      strumChart(
        {
          title: `Twelve-bar blues in ${key}`,
          artist: 'Lineup',
          bpm: 84,
          instruments: ukulele,
        },
        bluesBars(root),
        SHUFFLE,
      ),
    ]);
  }
  // the ukulele's shapes that slide: F (major), Am (minor) and A7 (seventh), a fret at a time
  const eight = [0, 1, 2, 3, 4, 5, 6, 7];
  rows.push(
    slide(
      'ex-ukulele-strum-shape-major',
      'Slide a shape: the F shape up the neck',
      'ukulele-strum',
      [2, 0, 1, 0],
      (k) => 5 + k,
      '',
      eight,
    ),
    slide(
      'ex-ukulele-strum-shape-minor',
      'Slide a shape: the Am shape up the neck',
      'ukulele-strum',
      [2, 0, 0, 0],
      (k) => 9 + k,
      'm',
      eight,
    ),
    slide(
      'ex-ukulele-strum-shape-seventh',
      'Slide a shape: the A7 shape up the neck',
      'ukulele-strum',
      [0, 1, 0, 0],
      (k) => 9 + k,
      '7',
      eight,
    ),
  );
  // the guitar's barre shapes: the E form (root on the low E string) and the A form (root on the A string)
  const guitar = 'guitar-strum';
  const forms: [string, string, string, string][] = [
    ['e-major', 'the E shape', '', 'Slide a shape: the E shape (major barre chords)'],
    ['a-major', 'the A shape', '', 'Slide a shape: the A shape (major barre chords)'],
    ['e-minor', 'the E shape', 'm', 'Slide a shape: the E minor shape (barre chords)'],
    ['a-minor', 'the A shape', 'm', 'Slide a shape: the A minor shape (barre chords)'],
    ['e-seventh', 'the E shape', '7', 'Slide a shape: the E seventh shape (barre chords)'],
    ['a-seventh', 'the A shape', '7', 'Slide a shape: the A seventh shape (barre chords)'],
  ];
  for (const [id, , quality, title] of forms) {
    const form = GUITAR_BARRE_FORMS[quality]![id.startsWith('e') ? 0 : 1]!;
    const open = GUITAR_STANDARD[form.string]!;
    rows.push(
      slide(
        `ex-guitar-strum-shape-${id}`,
        title,
        guitar,
        form.rel,
        (k) => open + k,
        quality,
        [1, 2, 3, 4, 5, 6, 7, 8],
      ),
    );
  }
  // power chords: two notes, no third, the rock guitarist's chord
  rows.push(
    [
      'ex-guitar-strum-power-basics',
      strumChart(
        { title: 'Power chords: E5, A5, D5, G5', artist: 'Lineup', bpm: 80, instruments: [guitar] },
        'E5 | A5 | D5 | G5 | E5 | A5 | D5 | G5',
        DOWNS,
      ),
    ],
    [
      'ex-guitar-strum-power-rock',
      strumChart(
        { title: 'Power chord rock in E', artist: 'Lineup', bpm: 100, instruments: [guitar] },
        'E5 | E5 | G5 | A5 | E5 | E5 | D5 | A5',
        'D . D U . U D U',
      ),
    ],
  );
  return Object.fromEntries(rows);
}
