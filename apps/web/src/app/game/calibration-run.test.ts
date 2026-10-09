import { getProfile } from '@lineup/core';
import { UKE_CHORDS, ukeStrum } from '@lineup/testkit';
import { simulateCalibration } from '@lineup/sim';
import { describe, expect, it } from 'vitest';
import { analyzeCalibration, planCalibration } from './calibration-run';

const profile = getProfile('ukulele-strum');
const response = (i: number, sr: number) => ukeStrum(UKE_CHORDS['C']!, sr, { seed: i });

describe('planCalibration', () => {
  it('schedules quiet then play clicks at the interval', () => {
    const p = planCalibration(10);
    expect(p.clicks).toHaveLength(15);
    expect(p.clicks[0]).toBe(10);
    expect(p.clicks[14]).toBe(17);
    expect(p.quiet).toBe(3);
    expect(planCalibration(1, { quiet: 1, play: 2, interval: 1 })).toEqual({
      clicks: [1, 2, 3],
      quiet: 1,
    });
  });
});

describe('analyzeCalibration (against simulated players)', () => {
  /** A player who stays silent for the first 3 clicks and responds to the rest. */
  function run(latency: number, extra: { jitter?: number; skip?: number[] } = {}) {
    const sim = simulateCalibration({
      response,
      profile,
      latency,
      jitter: extra.jitter ?? 0.01,
      skip: [0, 1, 2, ...(extra.skip ?? [])],
      noise: { rmsDb: -60 },
      seed: 3,
    });
    const plan = { clicks: sim.clicks, quiet: 3 };
    return { sim, outcome: analyzeCalibration(plan, sim.onsets) };
  }

  it.each([0.03, 0.12, 0.2])('measures a %d s latency within 8 ms', (latency) => {
    const { outcome } = run(latency);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind === 'ok')
      expect(Math.abs(outcome.estimate.offset - latency)).toBeLessThan(0.008);
  });

  it('a 0.3 s output latency (Bluetooth) is only measured right when the browser-reported latency is the prior', () => {
    const { sim } = run(0.3);
    const plan = { clicks: sim.clicks, quiet: 3 };
    const without = analyzeCalibration(plan, sim.onsets);
    // KNOWN LIMITATION: 0.3 s is more than half the 0.5 s click spacing, so with no expectation each
    // response looks like it answers the NEXT click.
    expect(without.kind === 'ok' && Math.abs(without.estimate.offset - 0.3) > 0.1).toBe(true);
    const withPrior = analyzeCalibration(plan, sim.onsets, 0.25);
    expect(withPrior.kind).toBe('ok');
    if (withPrior.kind === 'ok')
      expect(Math.abs(withPrior.estimate.offset - 0.3)).toBeLessThan(0.008);
  });

  it('a sensible prior does not disturb ordinary latencies', () => {
    for (const latency of [0.03, 0.12, 0.2]) {
      const { sim } = run(latency);
      const out = analyzeCalibration({ clicks: sim.clicks, quiet: 3 }, sim.onsets, 0.1);
      expect(out.kind === 'ok' && Math.abs(out.estimate.offset - latency) < 0.008).toBe(true);
    }
  });

  it('reports bleed when the mic hears the click track during the quiet clicks', () => {
    // a "speaker leak": onsets right on every click, including the silent ones
    const sim = simulateCalibration({ response, profile, latency: 0.02, jitter: 0.002, seed: 1 });
    const plan = { clicks: sim.clicks, quiet: 3 };
    expect(analyzeCalibration(plan, sim.onsets).kind).toBe('bleed');
  });

  it('fails with a helpful reason when the player barely responds', () => {
    const { outcome } = run(0.1, { skip: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13] });
    expect(outcome.kind).toBe('failed');
    if (outcome.kind === 'failed') expect(outcome.reason).toMatch(/responses were heard/);
  });

  it('ignores onsets from the quiet phase when estimating', () => {
    const { sim } = run(0.1);
    const plan = { clicks: sim.clicks, quiet: 3 };
    // stray noise bursts in the quiet phase must not move the estimate
    const polluted = [...sim.onsets, sim.clicks[0]! + 0.25, sim.clicks[1]! + 0.3].sort(
      (a, b) => a - b,
    );
    const a = analyzeCalibration(plan, sim.onsets);
    const b = analyzeCalibration(plan, polluted);
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('ok');
    if (a.kind === 'ok' && b.kind === 'ok')
      expect(b.estimate.offset).toBeCloseTo(a.estimate.offset, 6);
  });
});
