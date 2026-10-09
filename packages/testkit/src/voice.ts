import { rng } from './synth';

/** Formant centre frequencies (Hz) of a few sung vowels (adult, roughly average). */
export const VOWELS = {
  a: [700, 1220, 2600],
  o: [450, 800, 2830],
  i: [300, 2300, 3000],
  u: [325, 700, 2530],
} as const;
export type Vowel = keyof typeof VOWELS;

export interface VoiceOptions {
  amplitude?: number;
  vowel?: Vowel;
  /** Vibrato rate, Hz. */
  vibratoHz?: number;
  /** Vibrato depth, +/- cents. 0 = straight tone. */
  vibratoCents?: number;
  /** Random cycle-to-cycle pitch perturbation, fraction (0.004 = 0.4%). */
  jitter?: number;
  /** Random amplitude flutter, fraction. */
  shimmer?: number;
  /**
   * Breath (aspiration) noise, as a fraction of the voiced signal's level.
   * It is high-frequency (first-differenced white noise), like real
   * aspiration, so it hurts clarity without sitting on the fundamental.
   * ~0.02 clean, ~0.05 normal, ~0.1 breathy, ~0.2 whispery.
   */
  breath?: number;
  /**
   * Attenuate the fundamental by this many dB. Phone/tablet mics high-pass
   * low frequencies, so the 1st harmonic of a low voice can be far weaker
   * than the 2nd/3rd: the classic recipe for octave errors.
   */
  weakFundamentalDb?: number;
  /** Slow pitch wander, +/- cents (a random walk the singer corrects). */
  driftCents?: number;
  seed?: number;
}

/** Gain of the vocal tract at `f` Hz: sum of three resonance bumps over a falling glottal tilt. */
function tract(f: number, formants: readonly number[]): number {
  let g = 0;
  for (const [i, fc] of formants.entries()) {
    const bw = 80 + 40 * i;
    g += (1 / (1 + ((f - fc) / bw) ** 2)) * (1 - 0.15 * i);
  }
  return g + 0.05;
}

/**
 * A sung tone following `f0(t)` (Hz, or null for silence), built as a harmonic
 * series with a glottal spectral tilt (-12 dB/octave) shaped by vowel
 * formants, plus vibrato, jitter, shimmer, drift and breath noise. Not a real
 * voice, but it has the properties that make real voices hard for pitch
 * trackers: strong upper harmonics, formant peaks, a possibly weak
 * fundamental and a wobbling pitch.
 */
export function voice(
  f0: (t: number) => number | null,
  seconds: number,
  sampleRate: number,
  {
    amplitude = 0.3,
    vowel = 'a',
    vibratoHz = 5.5,
    vibratoCents = 0,
    jitter = 0.004,
    shimmer = 0.05,
    breath = 0.02,
    weakFundamentalDb = 0,
    driftCents = 0,
    seed = 1,
  }: VoiceOptions = {},
): Float32Array {
  const r = rng(seed);
  const formants = VOWELS[vowel];
  const out = new Float32Array(Math.round(seconds * sampleRate));
  const weak = 10 ** (-weakFundamentalDb / 20);
  let phase = 0;
  let drift = 0;
  let jit = 0;
  let amp = 1;
  let prevWhite = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const base = f0(t);
    if (base === null || base <= 0) {
      phase = 0;
      continue;
    }
    // slow drift (random walk pulled back to 0), per-cycle jitter/shimmer (held for a short while)
    if (i % 64 === 0) {
      drift = drift * 0.995 + r() * driftCents * 0.05;
      jit = jit * 0.7 + r() * jitter * 0.7;
      amp = 1 + shimmer * r();
    }
    const cents = vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t) + drift;
    const f = base * 2 ** (cents / 1200) * (1 + jit);
    phase += (2 * Math.PI * f) / sampleRate;
    let s = 0;
    const kMax = Math.min(40, Math.floor((sampleRate / 2 - 100) / f));
    for (let k = 1; k <= kMax; k++) {
      const hz = k * f;
      let a = (1 / k) * tract(hz, formants); // 1/k ~ -6 dB/oct source, tract adds the rest
      if (k === 1) a *= weak;
      s += a * Math.sin(k * phase);
    }
    const white = r();
    const aspiration = white - prevWhite; // high-passed: aspiration noise lives above the fundamental
    prevWhite = white;
    out[i] = amplitude * amp * (s * 0.35 + breath * aspiration);
  }
  return out;
}

export interface SungNote {
  /** Seconds from the start of the signal. */
  start: number;
  duration: number;
  hz: number;
}

export interface MelodyOptions extends VoiceOptions {
  /** Each note starts this many cents flat and glides up (a "scoop"). */
  scoopCents?: number;
  scoopMs?: number;
  attackMs?: number;
  releaseMs?: number;
}

/** A sung melody: each note gets an amplitude envelope and an optional scoop into pitch. */
export function sungMelody(
  notes: readonly SungNote[],
  seconds: number,
  sampleRate: number,
  {
    scoopCents = 0,
    scoopMs = 70,
    attackMs = 25,
    releaseMs = 60,
    ...voiceOptions
  }: MelodyOptions = {},
): Float32Array {
  const track = (t: number): number | null => {
    for (const n of notes) {
      if (t >= n.start && t < n.start + n.duration) {
        const into = (t - n.start) * 1000;
        const scoop = scoopCents && into < scoopMs ? scoopCents * (1 - into / scoopMs) : 0;
        return n.hz * 2 ** (-scoop / 1200);
      }
    }
    return null;
  };
  const out = voice(track, seconds, sampleRate, voiceOptions);
  // amplitude envelope per note (the voice() model is gated by the track; smooth the edges)
  for (const n of notes) {
    const a = Math.round((attackMs / 1000) * sampleRate);
    const rel = Math.round((releaseMs / 1000) * sampleRate);
    const s0 = Math.round(n.start * sampleRate);
    const s1 = Math.min(out.length, Math.round((n.start + n.duration) * sampleRate));
    for (let i = 0; i < a && s0 + i < s1; i++) out[s0 + i]! *= i / a;
    for (let i = 0; i < rel && s1 - 1 - i >= s0; i++) out[s1 - 1 - i]! *= i / rel;
  }
  return out;
}

/** One steady sung note, convenient for single-pitch tests. */
export function voiceNote(
  hz: number,
  seconds: number,
  sampleRate: number,
  options: MelodyOptions = {},
): Float32Array {
  return sungMelody([{ start: 0, duration: seconds, hz }], seconds, sampleRate, options);
}
