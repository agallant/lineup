import { powerSpectrum } from './fft';
import { MIN_DB, toDb } from './level';

/** Timbre of one hit: scale-invariant descriptors plus its level. */
export interface PercussionFeatures {
  /** Spectral centroid, Hz: where the "brightness" sits. */
  centroid: number;
  /** Fractions of spectral energy below 400 Hz, from 400 to 2500 Hz, and above 2500 Hz (sum to 1). */
  low: number;
  mid: number;
  high: number;
  /** Time for the envelope to fall to a quarter of its peak (-12 dB), ms. Capped at the window. */
  decayMs: number;
  /** Zero crossings per sample over the loud part, 0..0.5. */
  zcr: number;
  /** Spectral flatness 0 (tonal) .. 1 (noise). */
  flatness: number;
  peakDb: number;
  rmsDb: number;
}

export const LOW_EDGE_HZ = 400;
export const HIGH_EDGE_HZ = 2500;

/** The window analysed after an onset, in samples (power of two). */
export const FEATURE_WINDOW = 2048;

/**
 * Describes one hit from the samples starting just before its onset. Level
 * independent except for `peakDb`/`rmsDb`: the same clap at half the volume
 * has the same centroid, bands, decay, ZCR and flatness.
 */
export function extractFeatures(
  samples: ArrayLike<number>,
  sampleRate: number,
): PercussionFeatures {
  const n = Math.min(samples.length, FEATURE_WINDOW);
  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    peak = Math.max(peak, Math.abs(v));
    sumSq += v * v;
  }
  const rmsDb = toDb(Math.sqrt(sumSq / Math.max(1, n)));
  const peakDb = toDb(peak);
  if (peak === 0) {
    return {
      centroid: 0,
      low: 0,
      mid: 0,
      high: 0,
      decayMs: 0,
      zcr: 0,
      flatness: 0,
      peakDb: MIN_DB,
      rmsDb: MIN_DB,
    };
  }

  // ---- spectrum
  const power = powerSpectrum(samples, FEATURE_WINDOW);
  const binHz = sampleRate / FEATURE_WINDOW;
  const maxBin = Math.min(power.length - 1, Math.floor(16000 / binHz));
  let total = 0;
  let weighted = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  let logSum = 0;
  let count = 0;
  const floor = 1e-12 * (peak * peak) * FEATURE_WINDOW;
  for (let k = 1; k <= maxBin; k++) {
    const p = power[k]!;
    const f = k * binHz;
    total += p;
    weighted += p * f;
    if (f < LOW_EDGE_HZ) low += p;
    else if (f < HIGH_EDGE_HZ) mid += p;
    else high += p;
    logSum += Math.log(p + floor);
    count++;
  }
  const centroid = total > 0 ? weighted / total : 0;
  const mean = total / Math.max(1, count) + floor;
  const flatness = count ? Math.min(1, Math.exp(logSum / count) / mean) : 0;

  // ---- decay: 1 ms hop RMS envelope; time from its peak to a quarter of it
  const hop = Math.max(1, Math.round(0.001 * sampleRate));
  const env: number[] = [];
  for (let s = 0; s + hop <= n; s += hop) {
    let e = 0;
    for (let i = s; i < s + hop; i++) e += samples[i]! * samples[i]!;
    env.push(Math.sqrt(e / hop));
  }
  let peakIdx = 0;
  for (let i = 1; i < env.length; i++) if (env[i]! > env[peakIdx]!) peakIdx = i;
  let decayIdx = env.length - 1;
  for (let i = peakIdx; i < env.length; i++) {
    if (env[i]! <= env[peakIdx]! * 0.25) {
      decayIdx = i;
      break;
    }
  }
  const decayMs = ((decayIdx - peakIdx) * hop * 1000) / sampleRate;

  // ---- zero-crossing rate over samples that are clearly above the noise floor
  const gate = peak * 0.05;
  let crossings = 0;
  let active = 0;
  for (let i = 1; i < n; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    if (Math.abs(a) < gate && Math.abs(b) < gate) continue;
    active++;
    if ((a < 0 && b >= 0) || (a >= 0 && b < 0)) crossings++;
  }

  return {
    centroid,
    low: total > 0 ? low / total : 0,
    mid: total > 0 ? mid / total : 0,
    high: total > 0 ? high / total : 0,
    decayMs,
    zcr: active ? crossings / active : 0,
    flatness,
    peakDb,
    rmsDb,
  };
}

/** Plain record form carried on InputEvent.features. */
export function featuresToRecord(f: PercussionFeatures): Record<string, number> {
  return { ...f };
}
