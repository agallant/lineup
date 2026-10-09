/**
 * End-to-end simulations for the ukulele: a synthetic player performs a chart,
 * the audio goes through the real analyzer -> clock -> judge -> scoreboard
 * chain, and we assert the resulting judgments and score. This stands in for
 * a person playing a ukulele, so it can only vouch for the software, not for
 * how a real instrument and microphone behave (see the PR's "Unverified" list).
 */
import {
  chartFromBeats,
  getProfile,
  getSong,
  loadChart,
  type Chart,
  type Grade,
} from '@lineup/core';
import { UKE_CHORDS, ukeStrum } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { simulateCalibration } from './calibration';
import { renderPerformance } from './performance';
import { ukuleleNotePerformer, ukuleleStrumPerformer } from './performers';
import { runDiscrete } from './pipeline';

const strumChart = getSong('ukulele-strum-demo');
const noteChart = getSong('ukulele-notes-demo');
const strum = getProfile('ukulele-strum');
const notes = getProfile('ukulele-note');

const grades = (r: ReturnType<typeof runDiscrete>): Grade[] =>
  r.judgments
    .slice()
    .sort((a, b) => a.noteIndex - b.noteIndex)
    .map((j) => j.grade);

const rescale = (c: Chart, bpm: number): Chart => {
  const f = c.meta.bpm / bpm;
  const r = loadChart({
    ...c,
    meta: { ...c.meta, bpm },
    notes: c.notes.map((n) => ({ ...n, t: n.t * f, duration: n.duration * f })),
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

describe('ukulele strum mode: full pipeline', () => {
  const LATENCY = 0.12;

  it('a perfectly timed, calibrated player scores 24/24 perfect with ~0 ms error', () => {
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY });
    const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY });
    expect(r.score.counts).toEqual({ perfect: 24, good: 0, miss: 0 });
    expect(r.strays).toBe(0);
    expect(r.score.accuracy).toBe(1);
    expect(r.score.maxCombo).toBe(24);
    const errors = r.judgments.map((j) => Math.abs(j.timingError!));
    expect(Math.max(...errors)).toBeLessThan(0.005); // onset detection adds under 5 ms
  });

  it('WITHOUT calibration a 120 ms latency misses everything (why calibration exists)', () => {
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY });
    const r = runDiscrete(perf, strumChart, strum, { latencyOffset: 0 });
    expect(r.score.counts).toEqual({ perfect: 0, good: 0, miss: 24 });
    expect(r.strays).toBe(24);
  });

  it.each<[string, number, Grade]>([
    ['calibration 20 ms off', 0.02, 'perfect'],
    ['calibration 40 ms off', 0.04, 'perfect'],
    ['calibration 50 ms off', 0.05, 'good'],
    ['calibration 80 ms off', 0.08, 'good'],
    ['calibration 100 ms off', 0.1, 'good'],
  ])('%s -> every note %s', (_name, error, grade) => {
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY });
    const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY - error });
    expect(new Set(grades(r))).toEqual(new Set([grade]));
  });

  it('a calibration that is 120 ms off misses everything', () => {
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY });
    expect(runDiscrete(perf, strumChart, strum, { latencyOffset: 0 }).score.counts.miss).toBe(24);
  });

  it('accuracy falls smoothly as timing jitter grows', () => {
    const accuracy = [0, 0.01, 0.02, 0.04, 0.08].map((jitter) => {
      const perf = renderPerformance(strumChart, ukuleleStrumPerformer, {
        latency: LATENCY,
        jitter,
        seed: 3,
      });
      return runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY }).score.accuracy;
    });
    expect(accuracy[0]).toBe(1);
    expect(accuracy[1]).toBeGreaterThanOrEqual(0.98); // 10 ms sigma: still essentially perfect
    for (let i = 1; i < accuracy.length; i++)
      expect(accuracy[i]!).toBeLessThanOrEqual(accuracy[i - 1]! + 0.02);
    expect(accuracy.at(-1)!).toBeLessThan(0.7); // 80 ms sigma: clearly worse
    expect(accuracy.at(-1)!).toBeGreaterThan(0.3);
  });

  it('skipped notes are misses with reason no-input; everything else stays perfect', () => {
    const skip = [3, 10, 17];
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY, skip });
    const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY });
    expect(r.score.counts).toEqual({ perfect: 21, good: 0, miss: 3 });
    const missed = r.judgments.filter((j) => j.grade === 'miss');
    expect(missed.map((j) => j.noteIndex).sort((a, b) => a - b)).toEqual(skip);
    expect(missed.every((j) => j.reason === 'no-input')).toBe(true);
    expect(r.strays).toBe(0);
    expect(r.score.maxCombo).toBe(6); // runs between the skipped notes: 3, 6, 6, 6
  });

  it.each([-70, -60, -50, -40, -35])(
    'detects every strum in %d dBFS room noise (pink + mains hum)',
    (rmsDb) => {
      const perf = renderPerformance(strumChart, ukuleleStrumPerformer, {
        latency: LATENCY,
        noise: { rmsDb, seed: 5 },
      });
      const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY });
      expect(r.score.counts.miss).toBe(0);
      expect(r.score.counts.perfect).toBe(24);
      expect(r.strays).toBeLessThanOrEqual(1);
    },
  );

  it.each([100, 140, 180, 220, 260])('keeps up at %d bpm (strums as close as 115 ms)', (bpm) => {
    const chart = rescale(strumChart, bpm);
    const perf = renderPerformance(chart, ukuleleStrumPerformer, { latency: 0.1 });
    const r = runDiscrete(perf, chart, strum, { latencyOffset: 0.1 });
    expect(r.score.counts).toEqual({ perfect: 24, good: 0, miss: 0 });
  });

  it('results do not depend on where the AudioContext clock happens to be', () => {
    const run = (ctxStart: number) => {
      const perf = renderPerformance(strumChart, ukuleleStrumPerformer, {
        latency: LATENCY,
        jitter: 0.02,
        seed: 9,
        ctxStart,
      });
      const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY });
      return r.judgments.map((j): [number, Grade, number] => [
        j.noteIndex,
        j.grade,
        Math.round((j.timingError ?? 0) * 1e6),
      ]);
    };
    const base = run(0);
    for (const ctxStart of [12.3456, 98765.4321]) {
      const other = run(ctxStart);
      expect(other.map((j) => [j[0], j[1]])).toEqual(base.map((j) => [j[0], j[1]]));
      other.forEach((j, i) => expect(Math.abs(j[2] - base[i]![2])).toBeLessThanOrEqual(2)); // microseconds
    }
  });

  it('results do not depend on how often the game loop calls advance()', () => {
    const perf = renderPerformance(strumChart, ukuleleStrumPerformer, {
      latency: LATENCY,
      jitter: 0.03,
      seed: 2,
      skip: [5],
    });
    const at = (frameInterval: number) =>
      runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY, frameInterval })
        .judgments.map((j) => [j.noteIndex, j.grade])
        .sort((a, b) => Number(a[0]) - Number(b[0]));
    const base = at(1 / 60);
    expect(at(1 / 30)).toEqual(base);
    expect(at(1 / 120)).toEqual(base);
    expect(at(1 / 15)).toEqual(base);
  });

  it.each([0.01, 0.05, 0.1])(
    'strum input delayed %d s on its way to the game loop is still judged on time',
    (deliveryDelay) => {
      const perf = renderPerformance(strumChart, ukuleleStrumPerformer, { latency: LATENCY });
      const r = runDiscrete(perf, strumChart, strum, { latencyOffset: LATENCY, deliveryDelay });
      expect(r.score.counts).toEqual({ perfect: 24, good: 0, miss: 0 });
    },
  );

  it('is deterministic: same seed, same result', () => {
    const run = () =>
      runDiscrete(
        renderPerformance(strumChart, ukuleleStrumPerformer, {
          latency: LATENCY,
          jitter: 0.03,
          seed: 77,
          noise: { rmsDb: -55 },
        }),
        strumChart,
        strum,
        { latencyOffset: LATENCY },
      ).judgments.map((j) => [j.noteIndex, j.grade, j.timingError]);
    expect(run()).toEqual(run());
  });
});

describe('calibration, end to end', () => {
  const response = (i: number, sr: number) => ukeStrum(UKE_CHORDS['C']!, sr, { seed: i });

  it.each([0.02, 0.09, 0.137, 0.2])(
    'measures a true latency of %d s to within 8 ms, then plays perfectly with it',
    (latency) => {
      const cal = simulateCalibration({
        response,
        profile: strum,
        latency,
        jitter: 0.012,
        noise: { rmsDb: -60 },
        seed: 4,
      });
      expect(cal.estimate.ok).toBe(true);
      if (!cal.estimate.ok) return;
      expect(Math.abs(cal.estimate.offset - latency)).toBeLessThan(0.008);
      expect(['good', 'ok']).toContain(cal.estimate.quality);

      const perf = renderPerformance(strumChart, ukuleleStrumPerformer, {
        latency,
        jitter: 0.012,
        seed: 6,
      });
      const r = runDiscrete(perf, strumChart, strum, { latencyOffset: cal.estimate.offset });
      expect(r.score.counts.miss).toBe(0);
      expect(r.score.counts.perfect).toBeGreaterThanOrEqual(22);
    },
  );

  it('survives a few missed responses', () => {
    const cal = simulateCalibration({
      response,
      profile: strum,
      latency: 0.1,
      skip: [3, 7, 8],
      seed: 2,
    });
    expect(cal.estimate.ok).toBe(true);
    if (cal.estimate.ok) expect(Math.abs(cal.estimate.offset - 0.1)).toBeLessThan(0.008);
  });

  it('fails with a helpful message when the player barely responds', () => {
    const skip = Array.from({ length: 16 }, (_, i) => i).filter((i) => i !== 5 && i !== 9);
    const cal = simulateCalibration({ response, profile: strum, latency: 0.1, skip });
    expect(cal.estimate.ok).toBe(false);
    if (!cal.estimate.ok)
      expect(cal.estimate.reason).toMatch(/Only \d+ of \d+ responses were heard/);
  });

  it('never rates erratic timing as good', () => {
    const cal = simulateCalibration({
      response,
      profile: strum,
      latency: 0.1,
      jitter: 0.1,
      seed: 8,
    });
    if (cal.estimate.ok) expect(cal.estimate.quality).not.toBe('good');
  });
});

describe('ukulele single-note mode: pitch + timing', () => {
  const LATENCY = 0.1;

  it('a correct, calibrated melody scores 30/30 perfect', () => {
    const perf = renderPerformance(noteChart, ukuleleNotePerformer(), { latency: LATENCY });
    const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY });
    expect(r.score.counts).toEqual({ perfect: 30, good: 0, miss: 0 });
    expect(r.strays).toBe(0);
    expect(Math.max(...r.judgments.map((j) => Math.abs(j.pitchErrorCents ?? 0)))).toBeLessThan(10);
  });

  it.each([0, 61, 128, 199, 256, 311, 384, 457, 511])(
    'pitch-attached events arrive before their note expires at every hop phase (%d samples)',
    (leadSamples) => {
      const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
        latency: LATENCY,
        leadSamples,
      });
      const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY });
      expect(r.score.counts).toEqual({ perfect: 30, good: 0, miss: 0 });
      expect(r.strays).toBe(0);
    },
  );

  it.each([
    [1 / 60, 0],
    [1 / 120, 200],
    [1 / 240, 400],
    [1 / 1000, 511],
    [1 / 1000, 0],
  ])(
    'a fast game loop (%d s/frame, e.g. 120 Hz ProMotion) does not expire notes before their pitch arrives',
    (frameInterval, leadSamples) => {
      const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
        latency: LATENCY,
        leadSamples,
      });
      const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY, frameInterval });
      expect(r.score.counts).toEqual({ perfect: 30, good: 0, miss: 0 });
      expect(r.strays).toBe(0);
    },
  );

  it.each([0, 0.01, 0.03, 0.06, 0.1])(
    'input still in flight from the worklet (%d s delivery delay) is not judged late',
    (deliveryDelay) => {
      const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
        latency: LATENCY,
        leadSamples: 300,
      });
      const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY, deliveryDelay });
      expect(r.score.counts).toEqual({ perfect: 30, good: 0, miss: 0 });
      expect(r.strays).toBe(0);
    },
  );

  it.each<[number, number]>([
    [20, 0],
    [40, 0],
    [55, 0],
    [80, 30],
    [120, 30],
  ])('a note played %d cents sharp: %d misses (tolerance is 60 cents)', (cents, misses) => {
    const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
      latency: LATENCY,
      override: (n) => ({ ...n, pitch: n.pitch! + cents / 100 }),
    });
    const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY });
    expect(r.score.counts.miss).toBe(misses);
  });

  it('wrong notes are misses with reason wrong-pitch; right notes around them still hit', () => {
    const wrong = [2, 7, 12, 17, 22, 27];
    const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
      latency: LATENCY,
      override: (n, i) => (wrong.includes(i) ? { ...n, pitch: n.pitch! + 2 } : n),
    });
    const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY });
    const missed = r.judgments.filter((j) => j.grade === 'miss');
    expect(missed.map((j) => j.noteIndex).sort((a, b) => a - b)).toEqual(wrong);
    expect(missed.every((j) => j.reason === 'wrong-pitch')).toBe(true);
    expect(r.score.counts.perfect).toBe(24);
  });

  it('a note played an octave low is wrong (the ukulele profile is not octave-forgiving)', () => {
    const perf = renderPerformance(noteChart, ukuleleNotePerformer(), {
      latency: LATENCY,
      override: (n, i) => (i === 4 ? { ...n, pitch: n.pitch! - 12 } : n),
    });
    const r = runDiscrete(perf, noteChart, notes, { latencyOffset: LATENCY });
    expect(r.judgments.find((j) => j.noteIndex === 4)!.grade).toBe('miss');
  });

  /**
   * KNOWN LIMITATION (see also @lineup/input onset-pitch test): wide leaps with
   * the previous note still ringing blend into one ambiguous pitch, so a
   * correctly played note can be judged wrong-pitch. Timing is unaffected.
   */
  it('KNOWN LIMITATION: correctly played wide leaps over ringing notes can be judged wrong-pitch', () => {
    const arpeggio = chartFromBeats(
      { title: 'Leaps', bpm: 120, instruments: ['ukulele-note'] },
      [60, 64, 67, 69, 72, 76, 81].map((pitch, i) => ({ beat: i, pitch })),
    );
    const perf = renderPerformance(arpeggio, ukuleleNotePerformer(0.9), { latency: LATENCY });
    const r = runDiscrete(perf, arpeggio, notes, { latencyOffset: LATENCY });
    expect(r.judgments.filter((j) => j.reason === 'wrong-pitch').length).toBeGreaterThanOrEqual(1);
    // ...while damped, the same performance is flawless:
    const damped = renderPerformance(arpeggio, ukuleleNotePerformer(0.45), { latency: LATENCY });
    expect(runDiscrete(damped, arpeggio, notes, { latencyOffset: LATENCY }).score.counts.miss).toBe(
      0,
    );
  });
});
