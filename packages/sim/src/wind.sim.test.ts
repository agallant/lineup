/**
 * End-to-end simulations for winds (Windline): a synthetic whistle, recorder
 * or ocarina player (few harmonics, a noisy attack, airy noise, a pitch that
 * settles) performs a song; the audio goes through the real analyzer -> clock
 * -> continuous judge -> scoreboard chain. Vouches for the software, not for
 * real instruments, breath or rooms.
 */
import {
  applyDifficulty,
  getProfile,
  getSong,
  loadChart,
  transposeChart,
  type Chart,
} from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { renderPerformance, type PerformanceOptions } from './performance';
import { windPerformer, type WindPerformerOptions } from './performers';
import { runContinuous } from './pipeline';

const profile = getProfile('wind');

/** The first `n` notes of a chart (full songs take seconds to synthesize per run). */
function take(chart: Chart, n: number): Chart {
  const r = loadChart({ ...chart, notes: chart.notes.slice(0, n) });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
}

const scale = take(getSong('wind-scale'), 12);
const LATENCY = 0.1;

function play(
  chart: Chart,
  player: WindPerformerOptions = {},
  perf: PerformanceOptions = {},
  judged: Chart = chart,
) {
  const rendered = renderPerformance(chart, windPerformer(player), { latency: LATENCY, ...perf });
  return runContinuous(rendered, judged, profile, { latencyOffset: LATENCY });
}

const misses = (r: ReturnType<typeof play>) => r.judgments.filter((j) => j.grade === 'miss');

describe('wind: an in-tune player', () => {
  it.each(['whistle', 'recorder', 'ocarina'] as const)(
    'a %s scores every note perfect',
    (timbre) => {
      const r = play(scale, { timbre });
      expect(r.score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
      expect(r.score.accuracy).toBeGreaterThan(0.94);
    },
  );

  it('a whole song (Ode to Joy) scores perfect', () => {
    const song = getSong('wind-ode');
    const r = play(song);
    expect(r.score.counts).toEqual({ perfect: song.notes.length, good: 0, miss: 0 });
  });

  it.each([2, 7, 12])('keeps up when the song is shifted up %d semitones (toward C7)', (shift) => {
    const up = transposeChart(scale, shift);
    const r = play(up);
    expect(r.score.counts.miss).toBe(0);
    expect(r.score.counts.perfect).toBe(12);
  });
});

describe('wind: real players are not perfect', () => {
  it('a noisy attack (chiff) and a pitch that settles in do not cost notes', () => {
    const r = play(scale, { chiff: 1.2, bendCents: -40 });
    expect(r.score.counts.miss).toBe(0);
    expect(r.score.counts.perfect).toBeGreaterThanOrEqual(11);
  });

  it('pitch wander and a little vibrato are fine', () => {
    const r = play(scale, { driftCents: 20, vibratoCents: 15 });
    expect(r.score.counts.miss).toBe(0);
  });

  it('a player who is 25 cents off on average (+/- 25 random) still lands every note', () => {
    const r = play(scale, { detuneCents: -15, detuneSigma: 25 });
    expect(r.score.counts.miss).toBe(0);
  });

  it('airy playing (10% breath noise) is tracked', () => {
    const r = play(scale, { breath: 0.1 });
    expect(r.score.counts.miss).toBe(0);
  });
});

describe('wind: wrong playing is marked wrong', () => {
  it('wrong notes miss and the rest do not', () => {
    const wrong = new Map([
      [2, 2],
      [5, -3],
      [9, 1],
    ]);
    const r = play(scale, { semitoneErrors: wrong });
    expect(misses(r).map((j) => j.noteIndex)).toEqual([2, 5, 9]);
  });

  it('an octave off is wrong (a fingering has one register, so octaves do not count)', () => {
    const r = play(scale, { octaveShift: 12 });
    expect(r.score.counts.miss).toBe(12);
  });

  it('75 cents flat is still on a note for Easy but not for Strict', () => {
    const rendered = renderPerformance(scale, windPerformer({ detuneCents: -75 }), {
      latency: LATENCY,
    });
    const strict = runContinuous(rendered, scale, profile, { latencyOffset: LATENCY });
    expect(strict.score.counts.miss).toBeGreaterThan(6);
    // the same playing, judged with the Easy preset
    const easyProfile = structuredClone(profile);
    easyProfile.judgment.pitch!.toleranceCents = applyDifficulty(
      {
        latencyOffset: 0,
        perfectWindow: 0,
        goodWindow: 0,
        toleranceCents: profile.judgment.pitch!.toleranceCents,
        octaveForgiving: false,
        vibratoSmoothing: 0,
        coverageGood: 0,
        coveragePerfect: 0,
        minClarity: 0,
        minLevelDb: 0,
        frameInterval: 0,
        settle: 0,
        minNoteDuration: 0,
      },
      'easy',
    ).toleranceCents;
    const easy = runContinuous(rendered, scale, easyProfile, { latencyOffset: LATENCY });
    expect(easy.score.counts.miss).toBe(0);
  });

  it('silence scores nothing', () => {
    const silent = renderPerformance(scale, () => null, { latency: LATENCY });
    const r = runContinuous(silent, scale, profile, { latencyOffset: LATENCY });
    expect(r.score.counts.miss).toBe(12);
  });
});
