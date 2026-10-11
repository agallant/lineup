/**
 * Every song in the library is played through the real chain for its mode (synthetic singer,
 * wind player, ukulele, hands and drum kit -> analyzer -> judge -> scoreboard): a song nobody can
 * score on is a bug in the song. Vouches for the charts and the software, not for real players.
 */
import { LIBRARY, getProfile, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { enrollSynthetic } from './enroll';
import { renderPerformance } from './performance';
import {
  percussionPerformer,
  ukuleleStrumPerformer,
  voicePerformer,
  windPerformer,
  type HitSound,
} from './performers';
import { runContinuous, runDiscrete } from './pipeline';
import { clap, hihat, kick, snare, tap } from '@lineup/testkit';

const LATENCY = 0.1;
const entries = (prefix: string) =>
  Object.entries(LIBRARY).filter(([id]) => id.startsWith(prefix)) as [string, Chart][];

const perfect = (counts: { perfect: number; good: number; miss: number }, n: number) =>
  expect(counts).toEqual({ perfect: n, good: 0, miss: 0 });

describe('library: pitched songs', () => {
  it.each(entries('sing-'))('%s: a steady singer scores every note perfect', (_id, chart) => {
    const rendered = renderPerformance(chart, voicePerformer({}), { latency: LATENCY });
    const r = runContinuous(rendered, chart, getProfile('voice'), { latencyOffset: LATENCY });
    perfect(r.score.counts, chart.notes.length);
  });

  it.each(entries('wind-'))('%s: a steady player scores every note perfect', (_id, chart) => {
    const rendered = renderPerformance(chart, windPerformer({}), { latency: LATENCY });
    const r = runContinuous(rendered, chart, getProfile('wind'), { latencyOffset: LATENCY });
    perfect(r.score.counts, chart.notes.length);
  });
});

describe('library: ukulele songs', () => {
  it.each([...entries('strum-'), ...entries('pick-')])(
    '%s: a steady player scores every strum or pluck perfect',
    (_id, chart) => {
      const rendered = renderPerformance(chart, ukuleleStrumPerformer, { latency: LATENCY });
      const r = runDiscrete(rendered, chart, getProfile('ukulele-strum'), {
        latencyOffset: LATENCY,
      });
      perfect(r.score.counts, chart.notes.length);
    },
  );
});

describe('library: rhythm songs', () => {
  const play = (chart: Chart, profileId: string, sounds: Record<string, HitSound>) => {
    const profile = getProfile(profileId);
    const model = Object.keys(sounds).length > 1 ? enrollSynthetic(profile, sounds).model : null;
    const rendered = renderPerformance(chart, percussionPerformer(sounds), { latency: LATENCY });
    return runDiscrete(rendered, chart, profile, { latencyOffset: LATENCY, timbreModel: model });
  };

  it.each(entries('clap-'))('%s: a steady clapper scores every clap perfect', (_id, chart) => {
    perfect(play(chart, 'clap', { hit: clap }).score.counts, chart.notes.length);
  });

  it.each(entries('hand-'))('%s: claps and taps each score perfect', (_id, chart) => {
    perfect(play(chart, 'hand-percussion', { clap, tap }).score.counts, chart.notes.length);
  });

  it.each(entries('kit-'))('%s: a steady drummer scores every hit perfect', (_id, chart) => {
    perfect(play(chart, 'drum-kit', { kick, snare, hat: hihat }).score.counts, chart.notes.length);
  });
});
