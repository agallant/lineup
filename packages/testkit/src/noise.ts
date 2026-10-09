import { rng } from './synth';

/** Scales `signal` in place so its RMS is `db` dBFS. Returns it. */
export function scaleToRmsDb(signal: Float32Array, db: number): Float32Array {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i]! * signal[i]!;
  const rms = Math.sqrt(sum / Math.max(1, signal.length));
  if (rms === 0) return signal;
  const gain = 10 ** (db / 20) / rms;
  for (let i = 0; i < signal.length; i++) signal[i]! *= gain;
  return signal;
}

/** Pink (1/f) noise via Paul Kellet's filter, scaled to `rmsDb` dBFS. */
export function pinkNoise(
  seconds: number,
  sampleRate: number,
  rmsDb: number,
  seed = 1,
): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < out.length; i++) {
    const white = r();
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return scaleToRmsDb(out, rmsDb);
}

export interface RoomNoiseOptions {
  /** Broadband (pink) noise level, dBFS RMS. A quiet room on a tablet mic is roughly -65 to -55. */
  rmsDb?: number;
  seed?: number;
  /** Mains hum frequency (50 or 60 Hz), with a 2nd harmonic. */
  humHz?: number;
  humDb?: number;
}

/** Quiet-room background: pink noise plus mains hum. */
export function roomNoise(
  seconds: number,
  sampleRate: number,
  { rmsDb = -62, seed = 1, humHz = 60, humDb = -78 }: RoomNoiseOptions = {},
): Float32Array {
  const out = pinkNoise(seconds, sampleRate, rmsDb, seed);
  const humAmp = 10 ** (humDb / 20) * Math.SQRT2;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    out[i]! +=
      humAmp * Math.sin(2 * Math.PI * humHz * t) +
      0.5 * humAmp * Math.sin(2 * Math.PI * 2 * humHz * t);
  }
  return out;
}

/** Adds `b` into `a` in place (same length or shorter). Returns `a`. */
export function addInto(a: Float32Array, b: Float32Array, gain = 1): Float32Array {
  for (let i = 0; i < a.length && i < b.length; i++) a[i]! += gain * b[i]!;
  return a;
}
