/** The metronome and recording pieces of free play, kept free of the page so they can be tested. */

/** A click of the metronome. */
export interface Click {
  /** Seconds on the audio clock. */
  time: number;
  /** The first beat of a bar, clicked higher. */
  accent: boolean;
}

/** Limits on what a player can set. */
export const BPM_RANGE = { min: 30, max: 240 } as const;

/** A tempo within the limits (a whole number), or the default when it is not a number. */
export function clampBpm(value: number, fallback = 100): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(value)));
}

/**
 * The clicks with a time in `[from, to)` for a metronome that began on a beat at `start`: one every
 * 60 / bpm seconds, the first of each bar accented. Used with a short look-ahead so the clicks stay
 * steady however busy the page is.
 */
export function clicksBetween(
  start: number,
  bpm: number,
  beatsPerBar: number,
  from: number,
  to: number,
): Click[] {
  const spb = 60 / bpm;
  const out: Click[] = [];
  const first = Math.max(0, Math.ceil((from - start) / spb - 1e-9));
  for (let n = first; start + n * spb < to; n++) {
    out.push({ time: start + n * spb, accent: n % beatsPerBar === 0 });
  }
  return out;
}

/** The recording formats to try, best first: Safari records mp4, Chrome and Firefox webm or ogg. */
export const RECORDING_TYPES: readonly string[] = [
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

/** The first of `RECORDING_TYPES` the browser can record, or '' to let it choose. */
export function pickRecordingType(supports: (type: string) => boolean): string {
  return RECORDING_TYPES.find((t) => supports(t)) ?? '';
}

/** A file extension for a recording's type. */
export function extensionFor(type: string): string {
  if (type.includes('mp4')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  return 'webm';
}

/** A length of time as m:ss. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
