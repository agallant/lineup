import { loadChart, rescaleChart, type Chart, type ChartNote } from '../chart';
import { chartKind, notePitch } from '../difficulty';
import { ukulelePlayable, ukulelePluck } from '../songs/notation';
import { chance, createRng, type Rng } from './random';

/** A song as written, a plainer version, or a busier one. */
export type Variation = 'original' | 'easier' | 'harder';

export const VARIATIONS: readonly Variation[] = ['original', 'easier', 'harder'];

export const isVariation = (v: unknown): v is Variation =>
  typeof v === 'string' && (VARIATIONS as readonly string[]).includes(v);

/** How each variation reads in a menu. */
export const VARIATION_LABELS: Readonly<Record<Variation, string>> = {
  original: 'As written',
  easier: 'Easier: plainer',
  harder: 'Harder: busier',
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const SOUNDING = 0.88;
/** Notes closer together than this (seconds) count as quick. */
const QUICK = 0.4;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const inKey = (pitch: number, key: number): boolean => MAJOR.includes(mod12(pitch - key));

/** The note of the major scale on `key` nearest to `pitch` (a semitone down on a tie). */
function snapToScale(pitch: number, key: number): number {
  for (const d of [0, -1, 1, -2, 2]) if (inKey(pitch + d, key)) return pitch + d;
  return pitch;
}

/** A note of the major scale on `key` strictly between `a` and `b`, nearest to `a`, or null. */
function between(a: number, b: number, key: number): number | null {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const step = a < b ? 1 : -1;
  for (let p = a + step; p > lo && p < hi; p += step) if (inKey(p, key)) return p;
  return null;
}

/** The note of the major scale on `key` just above `pitch`. */
function above(pitch: number, key: number): number {
  for (let p = pitch + 1; p < pitch + 4; p++) if (inKey(p, key)) return p;
  return pitch + 2;
}

interface Item {
  t: number;
  duration: number;
  pitch: number;
}

/** Reads a melody (sounded or plucked) as pitches and times. */
function toItems(chart: Chart): Item[] {
  return chart.notes.map((n) => ({ t: n.t, duration: n.duration, pitch: notePitch(n)! }));
}

/** Writes a melody back the way the chart had it: a sounded pitch, or a plucked string and fret. */
function fromItems(items: readonly Item[], picked: boolean): ChartNote[] {
  return items.map((i) =>
    picked
      ? { t: i.t, duration: 0, expected: { frets: ukulelePluck(i.pitch) } }
      : { t: i.t, duration: i.duration, pitch: i.pitch },
  );
}

function easierMelody(chart: Chart, picked: boolean): ChartNote[] {
  const key = chart.meta.tonic;
  let items = toItems(chart);
  // sharps and flats become the scale note beside them (a plucked note only if it can still be reached)
  if (key !== undefined) {
    items = items.map((i) => {
      const p = snapToScale(i.pitch, key);
      return { ...i, pitch: !picked || ukulelePlayable(p) ? p : i.pitch };
    });
  }
  // two quick notes become one longer one
  const out: Item[] = [];
  let lastMerged = false;
  for (const item of items) {
    const prev = out.at(-1);
    if (prev && item.t - prev.t < QUICK && !lastMerged) {
      prev.duration = item.t + item.duration - prev.t;
      lastMerged = true;
    } else {
      out.push({ ...item });
      lastMerged = false;
    }
  }
  return fromItems(out, picked);
}

function harderMelody(chart: Chart, picked: boolean, rng: Rng): ChartNote[] {
  const key = chart.meta.tonic ?? 72;
  const items = toItems(chart);
  const out: Item[] = [];
  items.forEach((item, i) => {
    const next = items[i + 1];
    const gap = next ? next.t - item.t : 0;
    const half = gap / 2;
    // a leap of a third gains the note between, splitting the first note's time
    const passing = next && gap >= 0.9 ? between(item.pitch, next.pitch, key) : null;
    if (
      next &&
      passing !== null &&
      Math.abs(next.pitch - item.pitch) <= 4 &&
      (!picked || ukulelePlayable(passing))
    ) {
      out.push({ ...item, duration: item.duration > 0 ? half * SOUNDING : 0 });
      out.push({
        t: item.t + half,
        duration: item.duration > 0 ? half * SOUNDING : 0,
        pitch: passing,
      });
      return;
    }
    // a long note gets a turn: the note above, then back
    const upper = above(item.pitch, key);
    if (next && gap >= 1.1 && chance(rng, 0.4) && (!picked || ukulelePlayable(upper))) {
      out.push({ ...item, duration: item.duration > 0 ? half * SOUNDING : 0 });
      out.push({
        t: item.t + half,
        duration: item.duration > 0 ? half * SOUNDING : 0,
        pitch: upper,
      });
      return;
    }
    out.push(item);
  });
  return fromItems(out, picked);
}

/** A chord with its seventh taken off: G7 becomes G (every plain chord has a fingering). */
const plain = (chord: string): string => chord.replace(/7$/, '');

function easierChords(chart: Chart): ChartNote[] {
  const spb = 60 / chart.meta.bpm;
  const onBeat = (n: ChartNote) => Math.abs(n.t / spb - Math.round(n.t / spb)) < 0.05;
  return chart.notes
    .filter(onBeat)
    .map((n) =>
      n.expected?.chord
        ? { ...n, expected: { ...n.expected, chord: plain(n.expected.chord) } }
        : { ...n },
    );
}

function harderChords(chart: Chart, rng: Rng): ChartNote[] {
  const spb = 60 / chart.meta.bpm;
  const out: ChartNote[] = [];
  chart.notes.forEach((n, i) => {
    out.push({ ...n });
    const next = chart.notes[i + 1];
    const onBeat = Math.abs(n.t / spb - Math.round(n.t / spb)) < 0.05;
    const room = next ? next.t - n.t >= spb * 1.0 - 0.01 : true;
    const sameChord = !next || next.expected?.chord === n.expected?.chord;
    // an up-stroke half a beat after a down-stroke that has room, never just before a chord change
    if (n.expected?.chord && onBeat && n.expected.direction === 'down' && room && sameChord) {
      if (chance(rng, 0.6)) {
        out.push({
          t: n.t + spb / 2,
          duration: 0,
          lane: 'up',
          expected: { chord: n.expected.chord, direction: 'up' },
        });
      }
    }
  });
  return out;
}

function easierRhythm(chart: Chart): ChartNote[] {
  const spb = 60 / chart.meta.bpm;
  const kept = chart.notes.filter((n) => Math.abs(n.t / spb - Math.round(n.t / spb)) < 0.05);
  // keep the original rather than strip a rhythm that has nothing on the beat
  return (kept.length >= 4 ? kept : chart.notes).map((n) => ({ ...n }));
}

function harderRhythm(chart: Chart, rng: Rng): ChartNote[] {
  const spb = 60 / chart.meta.bpm;
  const out: ChartNote[] = [];
  chart.notes.forEach((n, i) => {
    out.push({ ...n });
    const next = chart.notes[i + 1];
    const onBeat = Math.abs(n.t / spb - Math.round(n.t / spb)) < 0.05;
    // an extra hit half a beat later where there is a beat of room, never straight after a kick
    // (the microphone would miss it)
    if (onBeat && n.lane !== 'kick' && (!next || next.t - n.t >= spb - 0.01) && chance(rng, 0.5)) {
      out.push({
        t: n.t + spb / 2,
        duration: 0,
        ...(n.lane !== undefined ? { lane: n.lane } : {}),
      });
    }
  });
  return out;
}

/** Writes the chart back with new notes, checking it is still a valid chart. */
function withNotes(chart: Chart, notes: ChartNote[]): Chart {
  const result = loadChart({ ...chart, notes });
  if (!result.ok) throw new Error(`a varied chart is invalid:\n${result.errors.join('\n')}`);
  return result.value;
}

/**
 * A plainer or busier version of any song, made from the song and a seed (the same song, variation
 * and seed always give the same result). Melodies: easier merges quick notes and replaces sharps and
 * flats with scale notes; harder fills thirds with a passing note and turns long notes. Chord songs:
 * easier keeps the strokes on the beat and drops sevenths; harder adds up-strokes where there is
 * room. Rhythms: easier keeps the hits on the beat; harder adds hits between them. Easier is also
 * 15% slower; harder melodies are 15% faster and chord songs 10%. "Original" is the song itself.
 */
export function varyChart(chart: Chart, variation: Variation, seed = 1): Chart {
  if (variation === 'original' || chart.notes.length < 2) return chart;
  const kind = chartKind(chart);
  const rng = createRng(seed * 2654435761 + (variation === 'easier' ? 1 : 2));
  const picked = kind === 'picked';
  let notes: ChartNote[];
  if (kind === 'melody' || kind === 'picked') {
    notes = variation === 'easier' ? easierMelody(chart, picked) : harderMelody(chart, picked, rng);
  } else if (kind === 'chords') {
    notes = variation === 'easier' ? easierChords(chart) : harderChords(chart, rng);
  } else {
    notes = variation === 'easier' ? easierRhythm(chart) : harderRhythm(chart, rng);
  }
  notes.sort((a, b) => a.t - b.t);
  // a plainer version is also a little slower; a busier melody or chord song a little faster (a
  // rhythm stays put: a drum heard half a beat after a kick needs the time)
  const speed =
    variation === 'easier' ? 0.85 : kind === 'rhythm' ? 1 : kind === 'chords' ? 1.1 : 1.15;
  return rescaleChart(withNotes(chart, notes), speed);
}
