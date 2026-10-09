import { describe, expect, it } from 'vitest';
import {
  blocks,
  karplusStrong,
  mixAt,
  pluck,
  silence,
  sine,
  whiteNoise,
} from '../../test-utils/synth';
import { midiToFrequency, UKULELE_GCEA } from '../notes';
import { OnsetDetector, type Onset } from './onset';

const SR = 48000;
/** Allowed timing error, seconds. Calibration absorbs any constant bias. */
const TOLERANCE = 0.004;

function detect(signal: Float32Array, blockSize = 128): Onset[] {
  const d = new OnsetDetector(SR);
  const out: Onset[] = [];
  for (const [block, start] of blocks(signal, blockSize)) out.push(...d.process(block, start));
  return out;
}

function times(onsets: Onset[]): number[] {
  return onsets.map((o) => o.frame / SR);
}

describe('OnsetDetector', () => {
  it('finds each pluck of each string at the right time', () => {
    const at = [0.2, 0.7, 1.2, 1.7];
    const signal = silence(2.5, SR);
    UKULELE_GCEA.forEach((s, i) =>
      mixAt(signal, pluck(midiToFrequency(s.midi), 0.8, SR), at[i]!, SR),
    );
    const found = times(detect(signal));
    expect(found).toHaveLength(at.length);
    found.forEach((t, i) => expect(Math.abs(t - at[i]!)).toBeLessThan(TOLERANCE));
  });

  it('detects re-plucks of a string that is still ringing', () => {
    const at = [0.1, 0.4, 0.65, 0.9, 1.15];
    const hz = midiToFrequency(60);
    const signal = silence(2, SR);
    at.forEach((t, i) => mixAt(signal, karplusStrong(hz, 1.5, SR, { seed: i + 1 }), t, SR));
    const found = times(detect(signal));
    expect(found).toHaveLength(at.length);
    found.forEach((t, i) => expect(Math.abs(t - at[i]!)).toBeLessThan(TOLERANCE));
  });

  it('merges a strum (4 strings ~8 ms apart) into one onset', () => {
    const signal = silence(1, SR);
    UKULELE_GCEA.forEach((s, i) =>
      mixAt(
        signal,
        karplusStrong(midiToFrequency(s.midi), 0.8, SR, { seed: i + 3, amplitude: 0.25 }),
        0.3 + i * 0.008,
        SR,
      ),
    );
    const found = times(detect(signal));
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0]! - 0.3)).toBeLessThan(TOLERANCE);
  });

  it('handles 16th-note strums at 120 bpm (125 ms apart)', () => {
    const at = Array.from({ length: 8 }, (_, i) => 0.1 + i * 0.125);
    const signal = silence(1.5, SR);
    at.forEach((t, i) =>
      mixAt(signal, karplusStrong(midiToFrequency(64), 0.6, SR, { seed: 10 + i }), t, SR),
    );
    expect(detect(signal)).toHaveLength(at.length);
  });

  it('fires once for a sustained tone, not continuously', () => {
    const signal = silence(1.5, SR);
    mixAt(signal, sine(440, 1, SR), 0.25, SR);
    const found = times(detect(signal));
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0]! - 0.25)).toBeLessThan(TOLERANCE);
  });

  it('ignores steady background noise and very quiet signals', () => {
    // Noise from t=0 may register once as it starts; nothing after that.
    const noisy = whiteNoise(2, SR, 0.02);
    expect(detect(noisy).filter((o) => o.frame / SR > 0.05)).toHaveLength(0);

    const quiet = silence(1, SR);
    mixAt(quiet, pluck(440, 0.5, SR, { amplitude: 0.0005 }), 0.3, SR);
    expect(detect(quiet)).toHaveLength(0);
  });

  it('still detects a pluck over moderate background noise', () => {
    const signal = whiteNoise(1, SR, 0.005, 99);
    mixAt(signal, pluck(midiToFrequency(67), 0.6, SR), 0.4, SR);
    const found = times(detect(signal)).filter((t) => t > 0.05);
    expect(found).toHaveLength(1);
    expect(Math.abs(found[0]! - 0.4)).toBeLessThan(TOLERANCE);
  });

  it('gives louder plucks higher velocity', () => {
    const signal = silence(1.2, SR);
    mixAt(signal, pluck(440, 0.4, SR, { amplitude: 0.05 }), 0.1, SR);
    mixAt(signal, pluck(440, 0.4, SR, { amplitude: 0.6 }), 0.7, SR);
    const [soft, loud] = detect(signal);
    expect(soft!.velocity).toBeLessThan(loud!.velocity);
    expect(loud!.velocity).toBeLessThanOrEqual(1);
  });

  it('is independent of block size', () => {
    const signal = silence(1, SR);
    mixAt(signal, pluck(392, 0.5, SR), 0.31234, SR);
    const a = detect(signal, 128).map((o) => o.frame);
    const b = detect(signal, 97).map((o) => o.frame);
    const c = detect(signal, 4096).map((o) => o.frame);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
