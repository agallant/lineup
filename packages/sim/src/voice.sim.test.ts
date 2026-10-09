/**
 * End-to-end simulations for voice (Singline): a synthetic singer (harmonic
 * source + vowel formants + vibrato, scoops, drift, breath noise) performs the
 * demo song; the audio goes through the real analyzer -> clock -> continuous
 * judge -> scoreboard chain. Vouches for the software, not for real voices.
 */
import {
  getProfile,
  getSong,
  loadChart,
  midiToFrequency,
  transposeChart,
  type Chart,
  type PitchFrame,
} from '@lineup/core';
import {
  InputAnalyzer,
  analyzerOptionsFromProfile,
  detectBleed,
  toPitchFrame,
} from '@lineup/input';
import { addInto, blocks, roomNoise, silence, sine } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { renderPerformance, type PerformanceOptions } from './performance';
import { voicePerformer, type VoicePerformerOptions } from './performers';
import { runContinuous } from './pipeline';

const profile = getProfile('voice');

/** The first `n` notes of a chart (the full song takes seconds to synthesize per run). */
function take(chart: Chart, n: number): Chart {
  const r = loadChart({ ...chart, notes: chart.notes.slice(0, n) });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
}

const song = getSong('singline-demo');
const scale = take(song, 12); // C D E F G A A G F E D C
const LATENCY = 0.12;

function sing(
  chart: Chart,
  singer: VoicePerformerOptions = {},
  perf: PerformanceOptions = {},
  run: {
    latencyOffset?: number;
    deliveryDelay?: number;
    frameInterval?: number;
    judged?: Chart;
  } = {},
) {
  const rendered = renderPerformance(chart, voicePerformer(singer), { latency: LATENCY, ...perf });
  const { judged = chart, ...opts } = run;
  return runContinuous(rendered, judged, profile, { latencyOffset: LATENCY, ...opts });
}

const misses = (r: ReturnType<typeof sing>) => r.judgments.filter((j) => j.grade === 'miss');

describe('voice: a calibrated, in-tune singer', () => {
  it('scores every note perfect', () => {
    const r = sing(scale);
    expect(r.score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
    expect(r.score.accuracy).toBeGreaterThan(0.94);
    expect(r.score.maxCombo).toBe(12);
  });

  it('a whole song (54 notes, 48 s) scores perfect', () => {
    const r = sing(song);
    expect(r.score.counts).toEqual({ perfect: 54, good: 0, miss: 0 });
  });

  it.each([-12, 12, -24])(
    'singing %d semitones away is accepted (octave-forgiving)',
    (octaveShift) => {
      const r = sing(scale, { octaveShift });
      expect(r.score.counts.miss).toBe(0);
      expect(r.score.counts.perfect).toBe(12);
    },
  );

  it('is deterministic', () => {
    const run = () =>
      sing(scale, { vibratoCents: 25, detuneSigma: 20 }, { seed: 4 }).judgments.map((j) => [
        j.noteIndex,
        j.grade,
        j.coverage,
      ]);
    expect(run()).toEqual(run());
  });
});

describe('voice: the way real singers sing', () => {
  it('30-cent vibrato, an 80-cent scoop into each note and 15-cent drift: no misses, all perfect', () => {
    const r = sing(scale, { vibratoCents: 30, scoopCents: 80, driftCents: 15 });
    expect(r.score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
  });

  it('wide 60-cent vibrato still lands thanks to smoothing', () => {
    const r = sing(scale, { vibratoCents: 60 });
    expect(r.score.counts.miss).toBe(0);
  });

  it('sloppy pitch (35-cent sigma per note) plus vibrato: nothing missed', () => {
    const r = sing(scale, { detuneSigma: 35, vibratoCents: 25 }, { seed: 7 });
    expect(r.score.counts.miss).toBe(0);
  });

  it.each(['a', 'o', 'i', 'u'] as const)('vowel /%s/ is tracked correctly', (vowel) => {
    expect(sing(scale, { vowel }).score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
  });

  it('a weak fundamental (15 dB down, like a phone mic high-passing the lows) is fine', () => {
    expect(sing(scale, { weakFundamentalDb: 15 }).score.counts.miss).toBe(0);
  });

  it.each([0.02, 0.05, 0.07])(
    'breath noise %d (clean to fairly breathy): nothing missed',
    (breath) => {
      const r = sing(scale, { breath });
      expect(r.score.counts.miss).toBe(0);
      expect(r.score.accuracy).toBeGreaterThan(0.8);
    },
  );

  /**
   * KNOWN LIMITATION: very breathy / whispery singing (aspiration noise ~8 dB
   * below the voice) drops pitch clarity below the gate on many frames, so
   * notes lose coverage. The setup screen's clarity meter is how a player
   * sees this; a fuller tone or closer mic fixes it.
   */
  it('KNOWN LIMITATION: very breathy singing loses notes but is not wiped out; whispering is', () => {
    const breathy = sing(scale, { breath: 0.1 });
    expect(breathy.score.accuracy).toBeGreaterThan(0.25);
    expect(breathy.score.accuracy).toBeLessThan(0.8);
    expect(sing(scale, { breath: 0.2 }).score.accuracy).toBeLessThan(0.3);
  });
});

describe('voice: wrong, absent and late singing', () => {
  it.each([
    [40, 12, 0],
    [55, 12, 0],
    [75, 0, 12],
    [-90, 0, 12],
  ])('a constant %d cents off: %d perfect / %d miss', (detuneCents, perfect, miss) => {
    const r = sing(scale, { detuneCents });
    expect(r.score.counts.perfect).toBe(perfect);
    expect(r.score.counts.miss).toBe(miss);
    if (miss) expect(misses(r).every((j) => j.reason === 'wrong-pitch')).toBe(true);
  });

  it('wrong notes are exactly the misses, labelled wrong-pitch', () => {
    const r = sing(scale, {
      semitoneErrors: new Map([
        [3, 1],
        [7, -2],
      ]),
    });
    expect(
      misses(r)
        .map((j) => j.noteIndex)
        .sort((a, b) => a - b),
    ).toEqual([3, 7]);
    expect(misses(r).every((j) => j.reason === 'wrong-pitch')).toBe(true);
    expect(r.score.counts.perfect).toBe(10);
  });

  it('silent notes are misses labelled no-input', () => {
    const r = sing(scale, {}, { skip: [2, 5, 6] });
    expect(misses(r).map((j) => [j.noteIndex, j.reason])).toEqual([
      [2, 'no-input'],
      [5, 'no-input'],
      [6, 'no-input'],
    ]);
    expect(r.score.counts.perfect).toBe(9);
  });

  it('a singer 250 ms late is only "good" without calibration, perfect with it', () => {
    const late = { latency: 0.37 };
    const uncal = sing(scale, {}, late, { latencyOffset: 0.12 });
    expect(uncal.score.counts.miss).toBe(0);
    expect(uncal.score.counts.perfect).toBeLessThanOrEqual(2);
    expect(uncal.score.counts.good).toBeGreaterThanOrEqual(10);
    expect(sing(scale, {}, late, { latencyOffset: 0.37 }).score.counts.perfect).toBe(12);
  });

  it('timing is forgiving: 120 ms late is still perfect even uncalibrated', () => {
    expect(sing(scale, {}, {}, { latencyOffset: 0 }).score.counts.perfect).toBe(12);
  });
});

describe('voice: key selection (transposing the chart)', () => {
  it('a singer who sings the original key against a +5 chart misses', () => {
    const shifted = transposeChart(scale, 5);
    expect(sing(scale, {}, {}, { judged: shifted }).score.counts.miss).toBe(12);
  });

  it('a singer who follows the +5 chart scores perfect', () => {
    const shifted = transposeChart(scale, 5);
    expect(sing(shifted).score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
  });

  it('a whole-octave transposition is invisible to an octave-forgiving singer', () => {
    expect(sing(scale, {}, {}, { judged: transposeChart(scale, 12) }).score.counts.miss).toBe(0);
  });
});

describe('voice: environment', () => {
  it.each([-60, -50, -40])('room noise at %d dBFS', (rmsDb) => {
    const r = sing(scale, {}, { noise: { rmsDb, seed: 3 } });
    expect(r.score.counts.miss).toBe(0);
    expect(r.score.accuracy).toBeGreaterThan(0.9);
  });

  it.each([44100, 48000])('works at a %d Hz sample rate', (sampleRate) => {
    expect(sing(scale, {}, { sampleRate }).score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
  });

  it.each([0, 0.05, 0.1])('main-thread delivery delay of %d s changes nothing', (deliveryDelay) => {
    expect(sing(scale, {}, {}, { deliveryDelay }).score.counts).toEqual({
      perfect: 12,
      good: 0,
      miss: 0,
    });
  });

  it.each([1 / 30, 1 / 120, 1 / 1000])(
    'game loop cadence %d s changes nothing',
    (frameInterval) => {
      expect(sing(scale, {}, {}, { frameInterval }).score.counts).toEqual({
        perfect: 12,
        good: 0,
        miss: 0,
      });
    },
  );

  it('does not depend on the AudioContext start time or hop phase', () => {
    for (const perf of [
      { ctxStart: 12345.678 },
      { leadSamples: 100 },
      { leadSamples: 211, ctxStart: 3.3 },
    ]) {
      expect(sing(scale, {}, perf).score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
    }
  });
});

describe('voice: backing-track bleed (headphones matter)', () => {
  /** The guide tone leaking from the speaker into the mic while the player is silent. */
  function silentWithBleed(db: number) {
    return renderPerformance(scale, voicePerformer(), {
      latency: LATENCY,
      skip: scale.notes.map((_, i) => i),
      extra: (n, sr, songStart) => {
        const out = new Float32Array(n);
        for (const note of scale.notes) {
          const hz = midiToFrequency(note.pitch!);
          const tone = sine(hz, note.duration, sr, 10 ** (db / 20) * Math.SQRT2);
          addInto(out.subarray(Math.round((note.t + LATENCY - songStart) * sr)), tone);
        }
        return out;
      },
    });
  }

  it('KNOWN LIMITATION: a loud guide tone leaking into the mic scores for a silent player', () => {
    const r = runContinuous(silentWithBleed(-35), scale, profile, { latencyOffset: LATENCY });
    expect(r.score.accuracy).toBeGreaterThan(0.7); // free points: this is why the setup screen checks for bleed
  });

  it('a quiet leak below the level gate scores nothing', () => {
    const r = runContinuous(silentWithBleed(-65), scale, profile, { latencyOffset: LATENCY });
    expect(r.score.counts).toEqual({ perfect: 0, good: 0, miss: 12 });
    expect(misses(r).every((j) => j.reason === 'no-input')).toBe(true);
  });

  /** Pitch frames the voice pipeline produces for a 1.2 s 523 Hz test tone at `db` over room noise. */
  function bleedFrames(db: number, sampleRate = 48000): PitchFrame[] {
    const sig = silence(1.2, sampleRate);
    addInto(sig, sine(523.25, 1.2, sampleRate, 10 ** (db / 20) * Math.SQRT2));
    addInto(sig, roomNoise(1.2, sampleRate, { rmsDb: -62, seed: 2 }));
    const analyzer = new InputAnalyzer(sampleRate, analyzerOptionsFromProfile(profile));
    const frames: PitchFrame[] = [];
    for (const [b, s] of blocks(sig)) {
      for (const m of analyzer.process(b, s))
        if (m.type === 'frame') frames.push(toPitchFrame(m.frame));
    }
    return frames.filter((f) => f.time > 0.15 && f.time < 1.05); // skip the ramp-in/out
  }

  it.each([-20, -35, -50])('detectBleed flags a tone leaking at %d dBFS', (db) => {
    const r = detectBleed(bleedFrames(db), 523.25);
    expect(r.bleeding).toBe(true);
    expect(r.fraction).toBeGreaterThan(0.9);
  });

  it.each([-62, -70])(
    'detectBleed passes a tone at %d dBFS (inaudible to the game as well)',
    (db) => {
      const r = detectBleed(bleedFrames(db), 523.25);
      expect(r.bleeding).toBe(false);
    },
  );

  it('detectBleed on nothing at all is "no bleed"', () => {
    expect(detectBleed([], 523.25)).toEqual({ fraction: 0, meanLevelDb: null, bleeding: false });
  });
});
