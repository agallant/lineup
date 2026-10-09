import { bandpass, highpass, lowpass } from './filters';
import { mixAt, rng } from './synth';

/**
 * Synthetic percussion. Sample 0 of every signal is the attack. All of them
 * take a `seed` and a `variation` (0..1, default 0.15): real hits are never
 * identical, so centre frequencies, decays and levels wobble per hit.
 */
export interface HitOptions {
  amplitude?: number;
  seed?: number;
  /** Hit-to-hit variation of tone and decay, 0 = identical every time (symmetric: +-variation, capped at 0.9). */
  variation?: number;
}

const wobble = (random: () => number, base: number, variation: number): number =>
  base * (1 + Math.min(Math.max(variation, 0), 0.9) * random());

const toSamples = (seconds: number, sampleRate: number): number =>
  Math.max(1, Math.round(seconds * sampleRate));

/** Exponentially decaying noise burst through a band-pass: the building block of most hand sounds. */
export function noiseBurst(
  sampleRate: number,
  {
    centreHz,
    q = 1,
    decayMs,
    seconds,
    amplitude = 0.5,
    seed = 1,
  }: {
    centreHz: number;
    q?: number;
    decayMs: number;
    seconds?: number;
    amplitude?: number;
    seed?: number;
  },
): Float32Array {
  const random = rng(seed);
  const n = toSamples(seconds ?? (decayMs * 6) / 1000, sampleRate);
  const out = new Float32Array(n);
  const bp = bandpass(centreHz, q, sampleRate);
  const tau = (decayMs / 1000) * sampleRate;
  for (let i = 0; i < n; i++) out[i] = bp.process(random()) * Math.exp(-i / tau);
  // band-passing shrinks the level a lot; normalise to the requested amplitude
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const gain = peak > 0 ? amplitude / peak : 0;
  for (let i = 0; i < n; i++) out[i]! *= gain;
  return out;
}

function decayingSine(
  sampleRate: number,
  hz: number,
  endHz: number,
  decayMs: number,
  seconds: number,
  amplitude: number,
): Float32Array {
  const n = toSamples(seconds, sampleRate);
  const out = new Float32Array(n);
  const tau = (decayMs / 1000) * sampleRate;
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = endHz + (hz - endHz) * Math.exp(-i / (0.02 * sampleRate)); // quick pitch drop
    phase += (2 * Math.PI * f) / sampleRate;
    out[i] = amplitude * Math.sin(phase) * Math.exp(-i / tau);
  }
  return out;
}

/**
 * A hand clap: 2-4 closely spaced micro-bursts (the flam of two palms not
 * meeting at once) of 1-4 kHz noise, plus a short room tail.
 */
export function clap(
  sampleRate: number,
  { amplitude = 0.6, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = new Float32Array(toSamples(0.16, sampleRate));
  const bursts = 2 + Math.floor((random() + 1) * 1.5); // 2..4
  let at = 0;
  for (let b = 0; b < bursts; b++) {
    const burst = noiseBurst(sampleRate, {
      centreHz: wobble(random, 2200, variation),
      q: 0.8,
      decayMs: wobble(random, 9, variation),
      amplitude: amplitude * (b === bursts - 1 ? 1 : 0.7),
      seed: seed * 13 + b,
    });
    mixAt(out, burst, at, sampleRate);
    at += (5 + 6 * (random() + 1)) / 1000; // 5..17 ms apart
  }
  mixAt(
    out,
    noiseBurst(sampleRate, {
      centreHz: 1500,
      q: 0.6,
      decayMs: wobble(random, 28, variation),
      amplitude: amplitude * 0.25,
      seed: seed + 99,
    }),
    0.012,
    sampleRate,
  );
  return out;
}

/** A finger tap on a table: a quick low-mid thump with a tiny click. Quiet and short. */
export function tap(
  sampleRate: number,
  { amplitude = 0.35, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = decayingSine(
    sampleRate,
    wobble(random, 260, variation),
    wobble(random, 190, variation),
    wobble(random, 9, variation),
    0.08,
    amplitude,
  );
  mixAt(
    out,
    noiseBurst(sampleRate, {
      centreHz: 900,
      q: 0.7,
      decayMs: 2.5,
      amplitude: amplitude * 0.7,
      seed: seed + 5,
    }),
    0,
    sampleRate,
  );
  return out;
}

/** A flat-palm slap on a table or thigh: broadband mid noise with a low thump. */
export function slap(
  sampleRate: number,
  { amplitude = 0.55, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = noiseBurst(sampleRate, {
    centreHz: wobble(random, 800, variation),
    q: 0.5,
    decayMs: wobble(random, 22, variation),
    amplitude,
    seed,
  });
  mixAt(
    out,
    decayingSine(sampleRate, wobble(random, 150, variation), 100, 30, 0.1, amplitude * 0.5),
    0,
    sampleRate,
  );
  return out;
}

/** Bass tone of a hand drum (djembe/conga open tone). */
export function drumBass(
  sampleRate: number,
  { amplitude = 0.6, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = decayingSine(
    sampleRate,
    wobble(random, 140, variation),
    90,
    wobble(random, 110, variation),
    0.4,
    amplitude,
  );
  mixAt(
    out,
    noiseBurst(sampleRate, { centreHz: 500, q: 0.8, decayMs: 4, amplitude: amplitude * 0.4, seed }),
    0,
    sampleRate,
  );
  return out;
}

/** Slap tone of a hand drum: bright, short, mid-high. */
export function drumSlap(
  sampleRate: number,
  { amplitude = 0.55, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  return noiseBurst(sampleRate, {
    centreHz: wobble(random, 3000, variation),
    q: 1.2,
    decayMs: wobble(random, 16, variation),
    amplitude,
    seed,
  });
}

/** A shaker: high-frequency noise with a soft attack and a long-ish decay. */
export function shaker(
  sampleRate: number,
  { amplitude = 0.4, seed = 1, variation = 0.15 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const n = toSamples(0.18, sampleRate);
  const out = new Float32Array(n);
  const hp = highpass(wobble(random, 5000, variation), 0.7, sampleRate);
  const tau = (wobble(random, 55, variation) / 1000) * sampleRate;
  const rise = 0.008 * sampleRate;
  for (let i = 0; i < n; i++)
    out[i] = hp.process(random()) * Math.min(1, i / rise) * Math.exp(-i / tau) * amplitude * 1.6;
  return out;
}

/** Kick drum: low sine with a fast pitch drop and a beater click. */
export function kick(
  sampleRate: number,
  { amplitude = 0.7, seed = 1, variation = 0.1 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = decayingSine(
    sampleRate,
    wobble(random, 120, variation),
    52,
    wobble(random, 140, variation),
    0.35,
    amplitude,
  );
  mixAt(
    out,
    noiseBurst(sampleRate, {
      centreHz: 3000,
      q: 0.8,
      decayMs: 2,
      amplitude: amplitude * 0.35,
      seed,
    }),
    0,
    sampleRate,
  );
  return out;
}

/** Snare drum: a 190 Hz body plus noise rattle. */
export function snare(
  sampleRate: number,
  { amplitude = 0.6, seed = 1, variation = 0.1 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const out = decayingSine(
    sampleRate,
    wobble(random, 220, variation),
    180,
    45,
    0.25,
    amplitude * 0.6,
  );
  mixAt(
    out,
    noiseBurst(sampleRate, {
      centreHz: wobble(random, 4500, variation),
      q: 0.5,
      decayMs: wobble(random, 70, variation),
      amplitude,
      seed,
    }),
    0,
    sampleRate,
  );
  return out;
}

/** Closed hi-hat: tiny, bright, very short. */
export function hihat(
  sampleRate: number,
  { amplitude = 0.35, seed = 1, variation = 0.1 }: HitOptions = {},
): Float32Array {
  const random = rng(seed);
  const n = toSamples(0.1, sampleRate);
  const out = new Float32Array(n);
  const hp = highpass(wobble(random, 7000, variation), 0.8, sampleRate);
  const lp = lowpass(15000, 0.7, sampleRate);
  const tau = (wobble(random, 18, variation) / 1000) * sampleRate;
  for (let i = 0; i < n; i++)
    out[i] = lp.process(hp.process(random())) * Math.exp(-i / tau) * amplitude * 2;
  return out;
}
