/**
 * Every song in the library is played through the real chain for its mode (synthetic singer,
 * wind player, ukulele, hands and drum kit -> analyzer -> judge -> scoreboard): a song nobody can
 * score on is a bug in the song. Vouches for the charts and the software, not for real players.
 */
import {
  GROOVE_PROFILES,
  LIBRARY,
  MELODY_LEVELS,
  exerciseCharts,
  generateChordSong,
  generateGroove,
  generateMelody,
  getProfile,
  melodyScalesFor,
  rhythmExercises,
  type Chart,
} from '@lineup/core';
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

describe('generated and exercise material, played through the real chain', () => {
  const uke = (chart: Chart) => {
    const rendered = renderPerformance(chart, ukuleleStrumPerformer, { latency: LATENCY });
    return runDiscrete(rendered, chart, getProfile('ukulele-strum'), { latencyOffset: LATENCY });
  };
  const hits = (chart: Chart, profileId: string) => {
    const lanes = getProfile(profileId).lanes!.map((l) => l.id);
    const sounds: Record<string, HitSound> = Object.fromEntries(
      lanes.map((lane) => [
        lane,
        ({ kick, snare, hat: hihat, clap, tap, hit: clap } as Record<string, HitSound>)[lane]!,
      ]),
    );
    const profile = getProfile(profileId);
    const model = lanes.length > 1 ? enrollSynthetic(profile, sounds).model : null;
    const rendered = renderPerformance(chart, percussionPerformer(sounds), { latency: LATENCY });
    return runDiscrete(rendered, chart, profile, { latencyOffset: LATENCY, timbreModel: model });
  };

  it.each(Object.entries(exerciseCharts('ukulele-strum')))(
    '%s: every plucked note scores perfect',
    (_id, chart) => perfect(uke(chart).score.counts, chart.notes.length),
  );

  it.each(
    MELODY_LEVELS.flatMap(
      (level) =>
        [
          [level, 11],
          [level, 4093],
        ] as const,
    ),
  )('a random picked melody (%s, seed %i) scores perfect', (level, seed) => {
    const chart = generateMelody('ukulele-strum', {
      seed,
      scale: melodyScalesFor('ukulele-strum')[seed % 3]!,
      level,
    });
    perfect(uke(chart).score.counts, chart.notes.length);
  });

  it.each(
    MELODY_LEVELS.flatMap(
      (level) =>
        [
          [level, 3],
          [level, 777],
          [level, 90210],
        ] as const,
    ),
  )('a random chord song (%s, seed %i) is played (almost) perfectly', (level, seed) => {
    const chart = generateChordSong({ seed, level });
    const { counts } = uke(chart).score;
    if (level === 'easy') return perfect(counts, chart.notes.length);
    // In the harder songs the analyzer occasionally misses the strum that lands on a new chord,
    // for some chords (see Limitations in the README). It must stay rare.
    expect(counts.miss / chart.notes.length).toBeLessThan(0.06);
    expect(counts.perfect + counts.good + counts.miss).toBe(chart.notes.length);
  });

  it.each(
    GROOVE_PROFILES.flatMap((p) =>
      MELODY_LEVELS.flatMap(
        (level) =>
          [
            [p, level, 5],
            [p, level, 31337],
          ] as const,
      ),
    ),
  )('a random %s groove (%s, seed %i) scores every hit perfect', (profileId, level, seed) => {
    const chart = generateGroove(profileId, { seed, level });
    perfect(hits(chart, profileId).score.counts, chart.notes.length);
  });

  it.each(
    ['hand-percussion', 'drum-kit', 'clap'].flatMap((p) =>
      Object.entries(rhythmExercises(p)).map(([id, chart]) => [id, p, chart] as const),
    ),
  )('%s: every hit scores perfect', (_id, profileId, chart) => {
    perfect(hits(chart, profileId).score.counts, chart.notes.length);
  });
});
