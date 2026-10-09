import type { Chart, ChartNote } from '@lineup/core';
import { addInto, mixAt, rng, roomNoise, silence, type RoomNoiseOptions } from '@lineup/testkit';

/**
 * Turns one chart note into sound. Returns a signal whose sample 0 is the
 * attack, or null for "play nothing". Instrument-specific; see
 * ./performers.ts.
 */
export type Performer = (
  note: ChartNote,
  index: number,
  sampleRate: number,
  random: () => number,
) => Float32Array | null;

export interface PerformanceOptions {
  sampleRate?: number;
  /**
   * Seconds between the player producing a note and the analyzer hearing it:
   * output latency + input latency + the player's habitual lead/lag. Positive
   * = late. This is what calibration is supposed to find.
   */
  latency?: number;
  /** Gaussian timing jitter (standard deviation, seconds), clamped at 3 sigma. */
  jitter?: number;
  /** Note indexes the player doesn't play. */
  skip?: Iterable<number>;
  /** Per-note override of what gets played (wrong pitch, wrong lane...). */
  override?: (note: ChartNote, index: number) => ChartNote | null;
  /** Background room noise; null for a silent room. */
  noise?: RoomNoiseOptions | null;
  /** Extra signal mixed in over the whole performance (backing-track bleed, claps next door...). */
  extra?: (totalSamples: number, sampleRate: number, songStart: number) => Float32Array;
  seed?: number;
  /** Arbitrary AudioContext time of sample 0, to prove nothing depends on it starting at 0. */
  ctxStart?: number;
  /** Seconds of silence after the last note. */
  tail?: number;
  /**
   * Extra silent samples before the performance. The pitch tracker emits one
   * estimate per 512-sample hop, so shifting the audio by 0..511 samples moves
   * every onset to a different phase of the hop and exposes timing margins
   * that depend on it.
   */
  leadSamples?: number;
}

export interface PlayedNote {
  noteIndex: number;
  played: boolean;
  /** Song time at which the attack reaches the analyzer (chart time + latency + jitter). */
  soundTime: number;
}

export interface RenderedPerformance {
  signal: Float32Array;
  sampleRate: number;
  /** AudioContext time of sample 0. */
  ctxStart: number;
  /** Song time of sample 0 (negative: the count-in). */
  songStart: number;
  plan: PlayedNote[];
}

/** Standard normal from two uniforms (Box-Muller). */
function gaussian(random: () => number): number {
  const u1 = Math.max((random() + 1) / 2, 1e-12);
  const u2 = (random() + 1) / 2;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Renders a player performing `chart` with `performer`, as the mic would hear
 * it. A generator so callers can yield between notes: yields the fraction done
 * after each note and returns the finished performance.
 */
function* performanceSteps(
  chart: Chart,
  performer: Performer,
  {
    sampleRate = 48000,
    latency = 0,
    jitter = 0,
    skip = [],
    override,
    noise = null,
    extra,
    seed = 1,
    ctxStart: requestedCtxStart = 0,
    tail = 1.5,
    leadSamples = 0,
  }: PerformanceOptions = {},
): Generator<number, RenderedPerformance> {
  // The real worklet's clock advances in whole sample frames (currentFrame / sampleRate).
  const ctxStart = Math.round(requestedCtxStart * sampleRate) / sampleRate;
  const random = rng(seed);
  const skipped = new Set(skip);
  const countIn = (chart.meta.countInBeats * 60) / chart.meta.bpm;
  const songStart = -countIn - 0.5 - leadSamples / sampleRate;
  const lastT = chart.notes.reduce((m, n) => Math.max(m, n.t), 0);
  const total = Math.ceil((lastT - songStart + tail + 0.5) * sampleRate);
  const signal = silence(total / sampleRate, sampleRate);
  const plan: PlayedNote[] = [];

  for (const [i, note] of chart.notes.entries()) {
    const jit = Math.max(-3, Math.min(3, gaussian(random))) * jitter;
    const soundTime = note.t + latency + jit;
    const actual = override ? override(note, i) : note;
    const sound =
      skipped.has(i) || actual === null ? null : performer(actual, i, sampleRate, random);
    plan.push({ noteIndex: i, played: sound !== null, soundTime });
    if (sound) mixAt(signal, sound, soundTime - songStart, sampleRate);
    yield (i + 1) / chart.notes.length;
  }

  if (noise) addInto(signal, roomNoise(signal.length / sampleRate, sampleRate, noise));
  if (extra) addInto(signal, extra(signal.length, sampleRate, songStart));
  return { signal, sampleRate, ctxStart, songStart, plan };
}

/** Renders synchronously. */
export function renderPerformance(
  chart: Chart,
  performer: Performer,
  options: PerformanceOptions = {},
): RenderedPerformance {
  const steps = performanceSteps(chart, performer, options);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

/**
 * Renders while yielding to the event loop between notes (so a browser UI can
 * show progress instead of freezing). Same result as renderPerformance.
 */
export async function renderPerformanceAsync(
  chart: Chart,
  performer: Performer,
  options: PerformanceOptions = {},
  onProgress?: (fraction: number) => void,
): Promise<RenderedPerformance> {
  const steps = performanceSteps(chart, performer, options);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    onProgress?.(next.value);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
