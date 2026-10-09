import { blocks, scaleToRmsDb, sine, whiteNoise } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { PitchTracker, type PitchTrackerOptions } from './pitch';

const SR = 48000;
const voice: PitchTrackerOptions = {
  windowSize: 2048,
  hopSize: 256,
  minClarity: 0.7,
  minDb: -55,
  minHz: 70,
  maxHz: 1100,
};

function voicedHz(signal: Float32Array, opts: PitchTrackerOptions): number[] {
  const t = new PitchTracker(SR, opts);
  const out: number[] = [];
  for (const [b, s] of blocks(signal))
    for (const e of t.process(b, s)) if (e.hz !== null) out.push(e.hz);
  return out;
}

describe('PitchTracker foldIntoRange', () => {
  it('is off by default: a pitch an octave above maxHz is rejected', () => {
    expect(voicedHz(sine(1760, 0.5, SR, 0.4), voice)).toEqual([]);
  });

  it('shifts a reading exactly one octave above maxHz down into range', () => {
    const hz = voicedHz(sine(1760, 0.5, SR, 0.4), { ...voice, foldIntoRange: true });
    expect(hz.length).toBeGreaterThan(20);
    for (const f of hz) expect(f).toBeCloseTo(880, 0);
  });

  it('shifts a reading one octave below minHz up into range', () => {
    // a long window so 50 Hz is reliably read; minHz 70 puts it just out of range
    const opts = { ...voice, windowSize: 8192, hopSize: 1024, minHz: 70 };
    const sig = sine(50, 1.2, SR, 0.4);
    expect(voicedHz(sig, opts)).toEqual([]);
    const hz = voicedHz(sig, { ...opts, foldIntoRange: true });
    expect(hz.length).toBeGreaterThan(5);
    for (const f of hz) expect(f).toBeCloseTo(100, 0);
  });

  it('does not fold a reading more than one octave out of range', () => {
    // 20 Hz doubled is still below minHz 70: must stay rejected, not be doubled repeatedly
    const opts = { ...voice, windowSize: 16384, hopSize: 2048, minHz: 70, foldIntoRange: true };
    expect(voicedHz(sine(20, 2, SR, 0.4), opts)).toEqual([]);
  });

  it('does NOT fold garbage far outside the range (hiss must not become a pitch)', () => {
    const hiss = whiteNoise(2, SR, 1, 5);
    for (let i = 1; i < hiss.length; i++) hiss[i] = hiss[i]! - 0.95 * hiss[i - 1]!; // strong high-pass
    scaleToRmsDb(hiss, -25);
    const plain = voicedHz(hiss, voice);
    const folded = voicedHz(hiss, { ...voice, foldIntoRange: true });
    expect(folded.length).toBe(plain.length); // folding adds nothing for far-out readings
    expect(folded.length).toBeLessThan(0.1 * (hiss.length / 256));
  });

  it('leaves in-range pitches untouched', () => {
    const a = voicedHz(sine(440, 0.5, SR, 0.4), voice);
    const b = voicedHz(sine(440, 0.5, SR, 0.4), { ...voice, foldIntoRange: true });
    expect(b).toEqual(a);
  });
});
