import {
  chartFromBeats,
  type BeatNote,
  type Chart,
  type ChartMeta,
  type ChartNote,
} from '../chart';
import { UKULELE_CHORD_FRETS } from '../chords';

/**
 * Small text notations for writing songs by hand, compiled to the same charts as the JSON files.
 * A mistake in a notation throws when the module loads, so every test fails until it is fixed.
 */

type Meta = Pick<ChartMeta, 'title' | 'bpm'> & Partial<ChartMeta>;

/** How much of its length a pitched note sounds: the rest is the gap that separates repeated notes. */
const SOUNDING = 0.88;

const NOTE_NAMES: Readonly<Record<string, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** MIDI number of a note name such as "C4", "F#4" or "Bb3" (middle C is C4 = 60). */
export function parseNoteName(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name "${name}"`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return NOTE_NAMES[m[1]!]! + accidental + 12 * (Number(m[3]) + 1);
}

/** A length in beats: "1", "0.5" or a fraction such as "1/3". */
function parseBeats(text: string, where: string): number {
  const frac = /^(\d+)\/(\d+)$/.exec(text);
  const value = frac ? Number(frac[1]) / Number(frac[2]) : Number(text);
  if (!(value > 0) || !Number.isFinite(value)) throw new Error(`bad length "${text}" in ${where}`);
  return value;
}

/** Splits a notation into tokens; "|" (a bar line) is only for the writer's eyes. */
const tokens = (text: string): string[] => text.split(/\s+/).filter((t) => t !== '' && t !== '|');

/**
 * A melody written as notes: `C4` is one beat, `E4:2` two beats, `G4:1/3` a third of a beat,
 * `r:1` a rest. Bar lines (`|`) are ignored. `transpose` moves every note, e.g. up an octave
 * for a wind instrument.
 */
export function melodyNotes(text: string, transpose = 0): BeatNote[] {
  let beat = 0;
  const out: BeatNote[] = [];
  for (const token of tokens(text)) {
    const [name, length = '1'] = token.split(':') as [string, string?];
    const beats = parseBeats(length, `"${token}"`);
    if (name !== 'r') {
      out.push({ beat, beats: beats * SOUNDING, pitch: parseNoteName(name) + transpose });
    }
    beat += beats;
  }
  if (out.length === 0) throw new Error('a melody needs at least one note');
  return out;
}

/** A pitched melody chart; see {@link melodyNotes} for the notation. */
export function melodyChart(meta: Meta, text: string, transpose = 0): Chart {
  return chartFromBeats(meta, melodyNotes(text, transpose));
}

/** The ukulele's strings as tuned (G4 C4 E4 A4, the order of a note's `frets`), as MIDI numbers. */
const UKULELE_OPEN = [67, 60, 64, 69] as const;

/** The guitar's strings as tuned (E2 A2 D3 G3 B3 E4, the order of a note's `frets`), as MIDI numbers. */
export const GUITAR_OPEN = [40, 45, 50, 55, 59, 64] as const;

/** The highest fret a picked guitar melody is moved to. */
const GUITAR_MAX_FRET = 12;

/** The fret to hold on each of a guitar's strings to pluck `pitch`: the lowest fret that reaches it. */
export function guitarPluck(pitch: number): (number | null)[] {
  let best = -1;
  let bestFret = Infinity;
  GUITAR_OPEN.forEach((open, i) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= GUITAR_MAX_FRET && fret < bestFret) {
      best = i;
      bestFret = fret;
    }
  });
  if (best < 0) throw new Error(`MIDI ${pitch} is not on the guitar below fret ${GUITAR_MAX_FRET}`);
  return GUITAR_OPEN.map((_, i) => (i === best ? bestFret : null));
}

/** The highest fret a picked melody asks for. */
const MAX_FRET = 7;

/** The fret to hold on each string to pluck `pitch` on one string: the lowest fret that reaches it. */
export function ukulelePluck(pitch: number): (number | null)[] {
  let best = -1;
  let bestFret = Infinity;
  UKULELE_OPEN.forEach((open, i) => {
    const fret = pitch - open;
    if (fret >= 0 && fret <= MAX_FRET && fret < bestFret) {
      best = i;
      bestFret = fret;
    }
  });
  if (best < 0) throw new Error(`MIDI ${pitch} is not on the ukulele below fret ${MAX_FRET}`);
  return UKULELE_OPEN.map((_, i) => (i === best ? bestFret : null));
}

/** True when `pitch` can be plucked on one string within the first frets. */
export const ukulelePlayable = (pitch: number): boolean =>
  UKULELE_OPEN.some((open) => pitch - open >= 0 && pitch - open <= MAX_FRET);

/**
 * Turns pitched notes into plucked ukulele notes: each names the string and fret that sound it and
 * has no length (the string rings on its own).
 */
export const pluckNotes = (notes: readonly BeatNote[]): BeatNote[] =>
  notes.map((n) => ({ beat: n.beat, expected: { frets: ukulelePluck(n.pitch!) } }));

/** The pitch a plucked note sounds, from the one string and fret it names (a ukulele's or a guitar's), or null if it is not a pluck. */
function pluckedPitch(note: ChartNote): number | null {
  const frets = note.expected?.frets;
  const open = frets?.length === GUITAR_OPEN.length ? GUITAR_OPEN : UKULELE_OPEN;
  if (!frets || frets.length !== open.length) return null;
  const held = frets.flatMap((f, i) => (f === null ? [] : [{ f, i }]));
  return held.length === 1 ? open[held[0]!.i]! + held[0]!.f : null;
}

/** True when every note of the chart is a single plucked note (a picked melody or ukulele exercise). */
export const isPluckChart = (chart: Chart): boolean =>
  chart.notes.length > 0 && chart.notes.every((n) => pluckedPitch(n) !== null);

/**
 * A plucked chart with the pitch each note sounds written in, so it can be judged by pitch as well as
 * timing. Notes that are not single plucks (strums) and notes that already have a pitch are kept.
 */
export function withPluckPitches(chart: Chart): Chart {
  return {
    ...chart,
    notes: chart.notes.map((n) => {
      if (n.pitch !== undefined) return n;
      const pitch = pluckedPitch(n);
      return pitch === null ? n : { ...n, pitch };
    }),
  };
}

/** A melody for the ukulele: each note is plucked on one string at the fret that sounds it. */
export function pickedMelodyChart(meta: Meta, text: string): Chart {
  return chartFromBeats(meta, pluckNotes(melodyNotes(text)));
}

/**
 * Strummed chords: `bars` is the chords in order (`C | G7 | Am`, one per bar) and `pattern` is one
 * bar of the strum on a grid of `stepsPerBeat` steps per beat: `D` down, `U` up, `.` nothing.
 * Every chord must have a ukulele fingering.
 */
export function strumChart(
  meta: Meta,
  bars: string,
  pattern: string,
  { beatsPerBar = 4, stepsPerBeat = 2 } = {},
): Chart {
  const steps = [...pattern.replace(/\s+/g, '')];
  if (steps.length !== beatsPerBar * stepsPerBeat) {
    throw new Error(`strum pattern "${pattern}" needs ${beatsPerBar * stepsPerBeat} steps`);
  }
  const notes: BeatNote[] = [];
  tokens(bars).forEach((chord, bar) => {
    if (!UKULELE_CHORD_FRETS[chord]) throw new Error(`no ukulele fingering for chord "${chord}"`);
    steps.forEach((step, i) => {
      if (step === '.') return;
      if (step !== 'D' && step !== 'U') throw new Error(`bad strum step "${step}"`);
      const direction = step === 'D' ? 'down' : 'up';
      notes.push({
        beat: bar * beatsPerBar + i / stepsPerBeat,
        lane: direction,
        expected: { chord, direction },
      });
    });
  });
  return chartFromBeats(beatsPerBar === 4 ? meta : { ...meta, beatsPerBar }, notes);
}

/**
 * A groove written per lane on a grid: each line is `lane: pattern` with one character per step
 * (`x` is a hit, `.` is nothing), bar lines (`|`) and spaces ignored. All lanes must be the same
 * length, and no two lanes may hit on the same step (one sound at a time).
 */
export function grooveChart(
  meta: Meta,
  lanes: Readonly<Record<string, string>>,
  stepsPerBeat = 2,
): Chart {
  const notes: BeatNote[] = [];
  let length = -1;
  for (const [lane, pattern] of Object.entries(lanes)) {
    const steps = [...pattern.replace(/[\s|]+/g, '')];
    if (length >= 0 && steps.length !== length) {
      throw new Error(`lane "${lane}" has ${steps.length} steps, expected ${length}`);
    }
    length = steps.length;
    steps.forEach((step, i) => {
      if (step === 'x') notes.push({ beat: i / stepsPerBeat, lane });
      else if (step !== '.') throw new Error(`bad groove step "${step}" in lane "${lane}"`);
    });
  }
  notes.sort((a, b) => a.beat - b.beat);
  // one sound at a time: the player's microphone hears a single onset, so two lanes on one step
  // cannot both be judged
  for (let i = 1; i < notes.length; i++) {
    if (notes[i]!.beat === notes[i - 1]!.beat) {
      throw new Error(
        `lanes "${notes[i - 1]!.lane}" and "${notes[i]!.lane}" both hit at beat ${notes[i]!.beat}`,
      );
    }
  }
  return chartFromBeats(meta, notes);
}

/**
 * A ukulele chart as the same song for the guitar: strummed chords keep their names (the guitar's
 * fingerings show on its six strings), and each plucked note moves to the string and fret of a
 * guitar that sounds it. Charts of other instruments are returned unchanged.
 */
export function guitarChart(chart: Chart): Chart {
  if (!chart.meta.instruments?.includes('ukulele-strum')) return chart;
  const notes = chart.notes.map((n) => {
    const pitch = pluckedPitch(n);
    if (pitch === null) return n;
    return { ...n, pitch, expected: { ...n.expected, frets: guitarPluck(pitch) } };
  });
  return {
    ...chart,
    meta: {
      ...chart.meta,
      instruments: chart.meta.instruments.map((i) => (i === 'ukulele-strum' ? 'guitar-strum' : i)),
    },
    notes,
  };
}
