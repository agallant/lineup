import { noteFrets } from './chords';
import type { Chart, ChartNote } from './chart';

/**
 * How hard a song is, worked out from the chart itself so that every song, hand-written or
 * generated, is rated the same way. The score runs from 1 (easiest) to 10.
 */
export interface SongRating {
  /** 1 (very easy) to 10 (hard). */
  score: number;
  /** Five bands of two: 1 beginner, 2 easy, 3 medium, 4 hard, 5 expert. */
  stars: 1 | 2 | 3 | 4 | 5;
  /** The band as a word: Beginner, Easy, Medium, Hard, Expert. */
  label: RatingLabel;
  /** What kind of chart it is, which decides what the score looks at. */
  kind: 'melody' | 'picked' | 'chords' | 'rhythm';
  /**
   * For melodies: "diatonic" if every note is in the major scale of the song's key (so any diatonic
   * instrument can play it in its own key), "chromatic" if it has sharps or flats that need
   * half-holes, cross-fingerings or a chromatic instrument. Null for songs without pitches.
   */
  scale: 'diatonic' | 'chromatic' | null;
}

export type RatingLabel = 'Beginner' | 'Easy' | 'Medium' | 'Hard' | 'Expert';

const LABELS: readonly RatingLabel[] = ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert'];

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const median = (xs: readonly number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** The open strings of a ukulele (G4 C4 E4 A4), to read a plucked note back as a pitch. */
const UKULELE_OPEN = [67, 60, 64, 69];

const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

/** The pitch of a note: a sounded pitch, or the one string a plucked ukulele note names. */
function pitchOf(note: ChartNote): number | null {
  if (note.pitch !== undefined) return note.pitch;
  const frets = noteFrets(note);
  if (!frets || note.expected?.chord !== undefined) return null;
  const played = frets.flatMap((f, i) =>
    f === null || f === undefined ? [] : [UKULELE_OPEN[i]! + f],
  );
  return played.length === 1 ? played[0]! : null;
}

/**
 * Whether every pitch is in one major scale. A song with a stated key is held to that key; a song
 * without one passes if any of the twelve major scales holds all its notes.
 */
export function isDiatonic(pitches: readonly number[], tonic?: number): boolean {
  if (pitches.length === 0) return true;
  const fits = (key: number) => pitches.every((p) => MAJOR.has((((p - key) % 12) + 12) % 12));
  return tonic === undefined ? Array.from({ length: 12 }, (_, k) => k).some(fits) : fits(tonic);
}

/** Onset gaps in seconds. */
const gaps = (notes: readonly ChartNote[]): number[] =>
  notes
    .slice(1)
    .map((n, i) => n.t - notes[i]!.t)
    .filter((g) => g > 0);

function rateMelody(chart: Chart, pitches: number[]): number {
  const g = gaps(chart.notes);
  // fast: median gap between notes from 0.7 s (slow) down to 0.3 s (quick), and how many gaps are short
  const speed = clamp01((0.7 - median(g)) / 0.4);
  const busy = g.length ? g.filter((x) => x < 0.4).length / g.length : 0;
  const span = clamp01((Math.max(...pitches) - Math.min(...pitches)) / 24);
  const leaps = pitches.slice(1).map((p, i) => Math.abs(p - pitches[i]!));
  const leapShare = leaps.length ? leaps.filter((l) => l > 4).length / leaps.length : 0;
  const bigLeap = clamp01((Math.max(0, ...leaps) - 4) / 8);
  const key = chart.meta.tonic;
  const chromatic = pitches.filter(
    (p) => key !== undefined && !MAJOR.has((((p - key) % 12) + 12) % 12),
  );
  const chromaticShare = clamp01((chromatic.length / pitches.length) * 8);
  const length = clamp01(chart.notes.length / 120);
  return (
    0.18 * speed +
    0.17 * clamp01(busy * 2) +
    0.15 * span +
    0.13 * clamp01(leapShare * 3) +
    0.07 * bigLeap +
    0.2 * chromaticShare +
    0.1 * length
  );
}

function rateChords(chart: Chart): number {
  const chords = chart.notes.flatMap((n) => (n.expected?.chord ? [n.expected.chord] : []));
  const distinct = new Set(chords);
  let changes = 0;
  chords.forEach((c, i) => {
    if (i > 0 && c !== chords[i - 1]) changes++;
  });
  const secs = Math.max(1, chart.notes.at(-1)!.t);
  const bars = Math.max(1, secs / ((60 / chart.meta.bpm) * 4));
  const changesPerBar = changes / bars;
  const perSec = chart.notes.length / secs;
  const ups = chart.notes.filter((n) => n.expected?.direction === 'up').length / chart.notes.length;
  const colour = [...distinct].filter((c) => /7|m/.test(c)).length / Math.max(1, distinct.size);
  return (
    0.3 * clamp01((distinct.size - 2) / 5) +
    0.25 * clamp01((changesPerBar - 0.3) / 1.2) +
    0.2 * clamp01((perSec - 1.5) / 2.5) +
    0.15 * clamp01(ups * 2) +
    0.1 * colour
  );
}

function rateRhythm(chart: Chart): number {
  const g = gaps(chart.notes);
  const spb = 60 / chart.meta.bpm;
  const beats = chart.notes.map((n) => n.t / spb);
  const perSec = chart.notes.length / Math.max(1, chart.notes.at(-1)!.t);
  const near = (x: number, grid: number) => Math.abs(x / grid - Math.round(x / grid)) < 0.08;
  // finer than eighth notes: triplets, sixteenths
  const fine = beats.filter((b) => !near(b, 0.5)).length / beats.length;
  // syncopated: an off-beat onset whose beat before it was left empty
  const onBeat = new Set(beats.filter((b) => near(b, 1)).map((b) => Math.round(b)));
  const syncopated =
    beats.filter((b) => !near(b, 1) && !onBeat.has(Math.floor(b + 0.08))).length / beats.length;
  const lanes = new Set(chart.notes.map((n) => n.lane ?? 'hit'));
  let switches = 0;
  chart.notes.forEach((n, i) => {
    if (i > 0 && n.lane !== chart.notes[i - 1]!.lane) switches++;
  });
  const switchShare = chart.notes.length > 1 ? switches / (chart.notes.length - 1) : 0;
  const fast = clamp01((0.45 - median(g)) / 0.2);
  return (
    0.25 * clamp01((perSec - 1.5) / 3) +
    0.25 * clamp01(syncopated * 2.5) +
    0.15 * clamp01(fine * 2) +
    0.15 * clamp01((lanes.size - 1) / 2) +
    0.1 * switchShare +
    0.1 * fast
  );
}

/** What kind of chart this is, which decides what is rated and how it can be varied. */
export function chartKind(chart: Chart): SongRating['kind'] {
  return chart.notes.some((n) => n.expected?.chord !== undefined)
    ? 'chords'
    : chart.notes.some((n) => n.pitch !== undefined)
      ? 'melody'
      : chart.notes.some((n) => pitchOf(n) !== null)
        ? 'picked'
        : 'rhythm';
}

/** The pitch of a note: a sounded pitch, or the single string a plucked ukulele note names. */
export const notePitch = pitchOf;

/** Rates a chart; see {@link SongRating}. A chart with no notes rates as the easiest. */
export function rateChart(chart: Chart): SongRating {
  const kind = chartKind(chart);
  const pitches = chart.notes.flatMap((n) => {
    const p = pitchOf(n);
    return p === null ? [] : [p];
  });
  let raw = 0;
  if (chart.notes.length > 1) {
    raw =
      kind === 'chords'
        ? rateChords(chart)
        : kind === 'rhythm'
          ? rateRhythm(chart)
          : rateMelody(chart, pitches);
  }
  const score = Math.min(10, Math.max(1, Math.round(1 + 9 * raw)));
  const stars = Math.ceil(score / 2) as SongRating['stars'];
  const scale =
    kind === 'melody' || kind === 'picked'
      ? isDiatonic(pitches, chart.meta.tonic)
        ? 'diatonic'
        : 'chromatic'
      : null;
  return { score, stars, label: LABELS[stars - 1]!, kind, scale };
}

/** "★★☆☆☆": filled stars for the band, hollow for the rest. */
export const starString = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(5 - stars);

/** "Easy ★★☆☆☆ · diatonic": what to show beside a song's title. */
export function ratingText(rating: SongRating): string {
  const parts = [`${rating.label} ${starString(rating.stars)}`];
  if (rating.scale) parts.push(rating.scale);
  return parts.join(' · ');
}
