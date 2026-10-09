import { chartFromBeats } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { renderPerformance, renderPerformanceAsync } from './performance';
import { ukuleleNotePerformer } from './performers';

const chart = chartFromBeats({ title: 't', bpm: 120 }, [
  { beat: 0, pitch: 60 },
  { beat: 1, pitch: 64 },
  { beat: 2, pitch: 67 },
]);

describe('renderPerformance', () => {
  it('plans each note at chart time + latency (no jitter) and marks skipped ones', () => {
    const r = renderPerformance(chart, ukuleleNotePerformer(), { latency: 0.1, skip: [1] });
    expect(r.plan.map((p) => [p.noteIndex, p.played, +p.soundTime.toFixed(6)])).toEqual([
      [0, true, 0.1],
      [1, false, 0.6],
      [2, true, 1.1],
    ]);
  });

  it('starts before song time 0 to include the count-in, on the sample grid', () => {
    const r = renderPerformance(chart, ukuleleNotePerformer(), { ctxStart: 12.3456 });
    expect(r.songStart).toBeLessThan(-2); // 4 beats at 120 bpm = 2 s, plus lead
    expect(
      Math.abs(r.ctxStart * r.sampleRate - Math.round(r.ctxStart * r.sampleRate)),
    ).toBeLessThan(1e-6);
  });

  it('jitter is gaussian-ish, seeded and bounded at 3 sigma', () => {
    const many = chartFromBeats(
      { title: 't', bpm: 60 },
      Array.from({ length: 200 }, (_, i) => ({ beat: i, pitch: 60 })),
    );
    const r = renderPerformance(many, () => null, { jitter: 0.02, seed: 5 });
    const errs = r.plan.map((p) => p.soundTime - many.notes[p.noteIndex]!.t);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    const sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / errs.length);
    expect(Math.abs(mean)).toBeLessThan(0.005);
    expect(sd).toBeGreaterThan(0.014);
    expect(sd).toBeLessThan(0.026);
    expect(Math.max(...errs.map(Math.abs))).toBeLessThanOrEqual(0.0601);
    const again = renderPerformance(many, () => null, { jitter: 0.02, seed: 5 });
    expect(again.plan).toEqual(r.plan);
  });
});

describe('renderPerformanceAsync', () => {
  it('produces exactly what the synchronous version does, reporting progress and yielding', async () => {
    const sync = renderPerformance(chart, ukuleleNotePerformer(), { latency: 0.05, seed: 3 });
    const progress: number[] = [];
    let yielded = 0;
    const timer = setInterval(() => yielded++, 0);
    const async_ = await renderPerformanceAsync(
      chart,
      ukuleleNotePerformer(),
      { latency: 0.05, seed: 3 },
      (f) => progress.push(f),
    );
    clearInterval(timer);
    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    expect(async_.plan).toEqual(sync.plan);
    expect(async_.signal.length).toBe(sync.signal.length);
    expect(async_.signal.every((v, i) => v === sync.signal[i])).toBe(true);
    expect(yielded).toBeGreaterThan(0); // the timer fired while rendering: it really yields to the event loop
  });
});
