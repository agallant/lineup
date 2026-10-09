// Synthetic test signals so DSP can be tested without a microphone.

/** Small deterministic PRNG (mulberry32), returns values in [-1, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}

export function sine(
  hz: number,
  seconds: number,
  sampleRate: number,
  amplitude = 0.5,
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++)
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / sampleRate);
  return out;
}

export function whiteNoise(
  seconds: number,
  sampleRate: number,
  amplitude: number,
  seed = 1,
): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = amplitude * r();
  return out;
}

export interface PluckOptions {
  amplitude?: number;
  /** Decay time constant of the fundamental, seconds. */
  decay?: number;
  harmonics?: number;
  /**
   * String stiffness B: partial n sits at n*f0*sqrt(1 + B*n^2), so overtones
   * run slightly sharp like a real string. 0 = perfectly harmonic.
   */
  inharmonicity?: number;
}

/**
 * Additive plucked-string tone: harmonics with 1/n amplitudes, higher
 * harmonics decaying faster, and a short click at the attack. Pitch is exact.
 */
export function pluck(
  hz: number,
  seconds: number,
  sampleRate: number,
  { amplitude = 0.5, decay = 0.6, harmonics = 8, inharmonicity = 0 }: PluckOptions = {},
): Float32Array {
  const out = new Float32Array(Math.round(seconds * sampleRate));
  let norm = 0;
  for (let n = 1; n <= harmonics; n++) norm += 1 / n;
  for (let n = 1; n <= harmonics; n++) {
    const f = hz * n * Math.sqrt(1 + inharmonicity * n * n);
    if (f >= sampleRate / 2) break;
    const a = amplitude / n / norm;
    const tau = decay / n;
    for (let i = 0; i < out.length; i++) {
      const t = i / sampleRate;
      out[i]! += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t);
    }
  }
  // Pick attack: a few ms of decaying noise.
  const r = rng(Math.round(hz));
  const clickLen = Math.min(out.length, Math.round(0.004 * sampleRate));
  for (let i = 0; i < clickLen; i++) out[i]! += 0.3 * amplitude * r() * (1 - i / clickLen);
  return out;
}

/**
 * Karplus-Strong plucked string with an allpass for fractional delay, so the
 * pitch is accurate. Loop delay = N (delay line) + 0.5 (averaging filter) +
 * allpass delay.
 */
export function karplusStrong(
  hz: number,
  seconds: number,
  sampleRate: number,
  {
    amplitude = 0.5,
    damping = 0.996,
    seed = 7,
  }: { amplitude?: number; damping?: number; seed?: number } = {},
): Float32Array {
  const period = sampleRate / hz - 0.5;
  let n = Math.floor(period);
  let frac = period - n;
  if (frac < 0.1) {
    n -= 1;
    frac += 1;
  }
  const c = (1 - frac) / (1 + frac);
  const line = new Float32Array(n);
  const r = rng(seed);
  for (let i = 0; i < n; i++) line[i] = r();
  // Remove DC from the excitation so the string doesn't carry an offset.
  const mean = line.reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < n; i++) line[i]! -= mean;

  const out = new Float32Array(Math.round(seconds * sampleRate));
  let idx = 0;
  let prev = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < out.length; i++) {
    const s = line[idx]!;
    out[i] = amplitude * s;
    const lp = damping * 0.5 * (s + prev);
    prev = s;
    const ap = c * lp + apIn - c * apOut;
    apIn = lp;
    apOut = ap;
    line[idx] = ap;
    idx = (idx + 1) % n;
  }
  return out;
}

/** Adds `src` into `target` starting at `atSeconds`. Returns `target`. */
export function mixAt(
  target: Float32Array,
  src: Float32Array,
  atSeconds: number,
  sampleRate: number,
): Float32Array {
  const start = Math.round(atSeconds * sampleRate);
  for (let i = 0; i < src.length && start + i < target.length; i++) target[start + i]! += src[i]!;
  return target;
}

/** Splits a signal into AudioWorklet-sized render quanta. */
export function* blocks(signal: Float32Array, size = 128): Generator<[Float32Array, number]> {
  for (let start = 0; start < signal.length; start += size) {
    yield [signal.subarray(start, Math.min(start + size, signal.length)), start];
  }
}
