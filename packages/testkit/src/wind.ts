import { rng } from './synth';

/** Rough harmonic recipes (relative amplitudes of harmonics 1, 2, 3...) of the three target instruments. */
export const WIND_TIMBRES = {
  /** Penny/tin whistle: almost a pure tone, a little airy. */
  whistle: [1, 0.04, 0.01],
  /** Recorder: a clearer 2nd and 3rd harmonic. */
  recorder: [1, 0.3, 0.12, 0.05],
  /** Ocarina: soft, round, mostly fundamental. */
  ocarina: [1, 0.12, 0.03],
} as const;
export type WindTimbre = keyof typeof WIND_TIMBRES;

export interface WindOptions {
  amplitude?: number;
  timbre?: WindTimbre;
  /** Steady breath noise as a fraction of the tone's level (0.02 clean, 0.1 airy, 0.3 very breathy). */
  breath?: number;
  /** Strength of the "chiff" burst of noise as the note starts, as a fraction of the tone's level. */
  chiff?: number;
  /** The note starts this many cents off (flat < 0, sharp > 0) and settles over ~50 ms: the player finding the pitch. */
  bendCents?: number;
  /** Slow random pitch wander, +/- cents. */
  driftCents?: number;
  /** Gentle vibrato depth, +/- cents (0 = straight tone, the usual way these are played). */
  vibratoCents?: number;
  vibratoHz?: number;
  attackMs?: number;
  releaseMs?: number;
  seed?: number;
}

/**
 * One breath-driven note: a few harmonics (per `timbre`), a chiff at the
 * start, steady airy noise, a pitch that settles into place and a little
 * drift. Not a real whistle, but it has what matters to a pitch tracker and
 * a judge: almost no energy above the fundamental, high pitches (C5 to C7)
 * and a noisy attack.
 */
export function windNote(
  hz: number,
  seconds: number,
  sampleRate: number,
  {
    amplitude = 0.3,
    timbre = 'whistle',
    breath = 0.03,
    chiff = 0.5,
    bendCents = 0,
    driftCents = 0,
    vibratoCents = 0,
    vibratoHz = 5,
    attackMs = 15,
    releaseMs = 40,
    seed = 1,
  }: WindOptions = {},
): Float32Array {
  const r = rng(seed);
  const harmonics = WIND_TIMBRES[timbre];
  const out = new Float32Array(Math.max(1, Math.round(seconds * sampleRate)));
  const attack = Math.round((attackMs / 1000) * sampleRate);
  const release = Math.round((releaseMs / 1000) * sampleRate);
  let phase = 0;
  let drift = 0;
  let prevWhite = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    if (i % 64 === 0) drift = drift * 0.995 + r() * driftCents * 0.05;
    const cents =
      bendCents * Math.exp(-t / 0.05) +
      drift +
      vibratoCents * Math.sin(2 * Math.PI * vibratoHz * t);
    const f = hz * 2 ** (cents / 1200);
    phase += (2 * Math.PI * f) / sampleRate;
    let tone = 0;
    for (const [k, a] of harmonics.entries()) {
      if ((k + 1) * f < sampleRate / 2 - 200) tone += a * Math.sin((k + 1) * phase);
    }
    const white = r();
    const air = white - prevWhite; // high-passed: air noise sits above the fundamental
    prevWhite = white;
    const chiffGain = chiff * Math.exp(-t / 0.03);
    let env = 1;
    if (i < attack) env = i / attack;
    if (out.length - 1 - i < release) env = Math.min(env, (out.length - 1 - i) / release);
    out[i] = amplitude * env * (tone * 0.6 + (breath + chiffGain) * air);
  }
  return out;
}
