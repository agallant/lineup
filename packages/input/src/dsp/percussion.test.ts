import {
  clap,
  drumBass,
  drumSlap,
  hihat,
  kick,
  noiseBurst,
  shaker,
  silence,
  slap,
  snare,
  tap,
  whiteNoise,
} from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { FEATURE_WINDOW, extractFeatures, featuresToRecord } from './percussion';

const SR = 48000;
const feat = (s: Float32Array) => extractFeatures(s, SR);
const scaled = (s: Float32Array, g: number) => Float32Array.from(s, (v) => v * g);

describe('extractFeatures: what each sound looks like', () => {
  it('a kick is low and short-tonal: centroid in the low hundreds of Hz, energy in the low band', () => {
    const f = feat(kick(SR, { variation: 0 }));
    expect(f.centroid).toBeLessThan(500);
    expect(f.low).toBeGreaterThan(0.7);
    expect(f.high).toBeLessThan(0.15);
    expect(f.flatness).toBeLessThan(0.2); // tonal
  });

  it('a hi-hat is bright: centroid above 5 kHz, almost all energy in the high band, noisy', () => {
    const f = feat(hihat(SR, { variation: 0 }));
    expect(f.centroid).toBeGreaterThan(5000);
    expect(f.high).toBeGreaterThan(0.85);
    // noisy, but only above ~7 kHz so flat across the whole band is low; still far flatter than a tonal kick
    expect(f.flatness).toBeGreaterThan(feat(kick(SR, { variation: 0 })).flatness * 3);
  });

  it('a clap sits in the mid/high bands with a short decay', () => {
    const f = feat(clap(SR, { variation: 0 }));
    expect(f.centroid).toBeGreaterThan(1500);
    expect(f.centroid).toBeLessThan(4500);
    expect(f.mid + f.high).toBeGreaterThan(0.85);
    expect(f.decayMs).toBeLessThan(40);
  });

  it('a finger tap is darker than a clap, and a slap in between or brighter than the tap', () => {
    const c = feat(clap(SR, { variation: 0 }));
    const t = feat(tap(SR, { variation: 0 }));
    const s = feat(slap(SR, { variation: 0 }));
    expect(t.centroid).toBeLessThan(c.centroid);
    expect(t.centroid).toBeLessThan(s.centroid);
  });

  it('a hand-drum bass tone is lower than its slap tone; a shaker has a longer decay than a hat', () => {
    expect(feat(drumBass(SR, { variation: 0 })).centroid).toBeLessThan(
      feat(drumSlap(SR, { variation: 0 })).centroid,
    );
    expect(feat(shaker(SR, { variation: 0 })).decayMs).toBeGreaterThan(
      feat(hihat(SR, { variation: 0 })).decayMs,
    );
  });

  it('a snare is broadband (flatter, brighter) compared with a kick', () => {
    const s = feat(snare(SR, { variation: 0 }));
    const k = feat(kick(SR, { variation: 0 }));
    expect(s.centroid).toBeGreaterThan(k.centroid * 2);
    expect(s.flatness).toBeGreaterThan(k.flatness);
  });

  it('noise bursts follow their centre frequency and decay', () => {
    const lowBurst = feat(noiseBurst(SR, { centreHz: 400, q: 2, decayMs: 40, seconds: 0.2 }));
    const highBurst = feat(noiseBurst(SR, { centreHz: 6000, q: 2, decayMs: 40, seconds: 0.2 }));
    expect(highBurst.centroid).toBeGreaterThan(lowBurst.centroid * 3);
    const short = feat(noiseBurst(SR, { centreHz: 2000, q: 1, decayMs: 5, seconds: 0.2 }));
    const long = feat(noiseBurst(SR, { centreHz: 2000, q: 1, decayMs: 60, seconds: 0.2 }));
    expect(long.decayMs).toBeGreaterThan(short.decayMs * 4);
  });
});

describe('extractFeatures: invariances and edge cases', () => {
  it('shape features do not depend on loudness; level features do', () => {
    const base = clap(SR, { variation: 0, seed: 3 });
    const a = feat(base);
    const quiet = feat(scaled(base, 0.05));
    for (const k of ['centroid', 'low', 'mid', 'high', 'decayMs', 'zcr', 'flatness'] as const) {
      expect(quiet[k]).toBeCloseTo(a[k], 3);
    }
    expect(a.peakDb - quiet.peakDb).toBeCloseTo(26.02, 1);
  });

  it('band fractions sum to one', () => {
    for (const s of [clap(SR), kick(SR), hihat(SR), tap(SR)]) {
      const f = feat(s);
      expect(f.low + f.mid + f.high).toBeCloseTo(1, 6);
    }
  });

  it('silence has no features rather than NaN', () => {
    const f = feat(silence(0.05, SR));
    expect(f).toMatchObject({
      centroid: 0,
      low: 0,
      mid: 0,
      high: 0,
      decayMs: 0,
      zcr: 0,
      flatness: 0,
    });
    expect(f.peakDb).toBe(-120);
  });

  it('accepts windows shorter or longer than the analysis window', () => {
    expect(() => feat(clap(SR).subarray(0, 300))).not.toThrow();
    expect(() => feat(whiteNoise(0.2, SR, 0.3, 4))).not.toThrow();
    expect(FEATURE_WINDOW).toBe(2048);
  });

  it('white noise is flat and has a high zero-crossing rate; a kick is not', () => {
    const noise = feat(whiteNoise(0.05, SR, 0.3, 7));
    expect(noise.flatness).toBeGreaterThan(0.5);
    expect(noise.zcr).toBeGreaterThan(0.4);
    expect(feat(kick(SR, { variation: 0 })).zcr).toBeLessThan(0.1);
  });

  it('featuresToRecord is a plain copy', () => {
    const f = feat(clap(SR));
    expect(featuresToRecord(f)).toEqual({ ...f });
  });
});
