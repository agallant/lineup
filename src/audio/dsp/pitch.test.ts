import { describe, expect, it } from 'vitest';
import { blocks, karplusStrong, pluck, sine, whiteNoise } from '../../test-utils/synth';
import { centsBetween, midiToFrequency, noteFromFrequency, UKULELE_GCEA } from '../notes';
import { PitchTracker, type PitchEstimate } from './pitch';

const RATES = [44100, 48000];

function track(signal: Float32Array, sampleRate: number): PitchEstimate[] {
  const tracker = new PitchTracker(sampleRate);
  const out: PitchEstimate[] = [];
  for (const [block, start] of blocks(signal)) out.push(...tracker.process(block, start));
  return out;
}

/** Median of the voiced estimates' cents error, plus the fraction voiced. */
function summarize(estimates: PitchEstimate[], expectedHz: number) {
  const voiced = estimates.filter((e) => e.hz !== null);
  const cents = voiced.map((e) => centsBetween(e.hz!, expectedHz)).sort((a, b) => a - b);
  return {
    voicedRatio: voiced.length / estimates.length,
    medianCents: cents[Math.floor(cents.length / 2)] ?? NaN,
    worstCents: Math.max(...cents.map(Math.abs)),
    labels: new Set(voiced.map((e) => noteFromFrequency(e.hz!).label)),
  };
}

describe('PitchTracker', () => {
  for (const sampleRate of RATES) {
    describe(`@ ${sampleRate} Hz`, () => {
      for (const s of UKULELE_GCEA) {
        const hz = midiToFrequency(s.midi);

        it(`sine ${s.label}`, () => {
          const r = summarize(track(sine(hz, 0.5, sampleRate), sampleRate), hz);
          expect(r.voicedRatio).toBe(1);
          expect(r.worstCents).toBeLessThan(2);
        });

        it(`additive pluck ${s.label}: right note, no octave errors`, () => {
          const r = summarize(track(pluck(hz, 1, sampleRate), sampleRate), hz);
          expect(r.voicedRatio).toBeGreaterThan(0.9);
          expect([...r.labels]).toEqual([s.label]);
          expect(Math.abs(r.medianCents)).toBeLessThan(3);
        });

        it(`Karplus-Strong string ${s.label}`, () => {
          const r = summarize(track(karplusStrong(hz, 1, sampleRate), sampleRate), hz);
          expect(r.voicedRatio).toBeGreaterThan(0.9);
          expect([...r.labels]).toEqual([s.label]);
          expect(Math.abs(r.medianCents)).toBeLessThan(5);
        });
      }
    });
  }

  it('tracks fretted notes up the neck (A string, frets 0..12)', () => {
    for (let fret = 0; fret <= 12; fret++) {
      const hz = midiToFrequency(69 + fret);
      const r = summarize(track(pluck(hz, 0.5, 48000), 48000), hz);
      expect(Math.abs(r.medianCents), `fret ${fret}`).toBeLessThan(3);
    }
  });

  it('reports a slightly out-of-tune string in cents', () => {
    const hz = midiToFrequency(64) * 2 ** (-15 / 1200); // E4, 15 cents flat
    const r = summarize(track(pluck(hz, 1, 48000), 48000), midiToFrequency(64));
    expect(r.medianCents).toBeGreaterThan(-17);
    expect(r.medianCents).toBeLessThan(-13);
  });

  it('reports no pitch for white noise', () => {
    const r = summarize(track(whiteNoise(0.5, 48000, 0.3), 48000), 440);
    expect(r.voicedRatio).toBeLessThan(0.05);
  });

  it('reports no pitch for silence or a signal below the gate', () => {
    const quiet = sine(440, 0.3, 48000, 0.0005); // about -69 dBFS RMS
    expect(track(quiet, 48000).every((e) => e.hz === null)).toBe(true);
  });

  it('emits one estimate per hop once the window is full', () => {
    const est = track(sine(440, 1, 48000), 48000);
    expect(est.length).toBe(Math.floor((48000 - 2048) / 512) + 1);
    expect(est[0]!.centerFrame).toBe(1024);
    expect(est[1]!.centerFrame - est[0]!.centerFrame).toBe(512);
  });
});
