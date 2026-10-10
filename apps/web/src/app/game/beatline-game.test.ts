import {
  SongClock,
  chartChords,
  chordShapesFor,
  getProfile,
  getSong,
  type Chart,
  type TimeSource,
  type TimbreModel,
} from '@lineup/core';
import { InputAnalyzer, analyzerOptionsFromProfile } from '@lineup/input';
import { ANY_LANE } from '@lineup/render';
import {
  enrollSynthetic,
  percussionPerformer,
  renderPerformance,
  ukuleleStrumPerformer,
  type HitSound,
} from '@lineup/sim';
import { clap, shaker, tap } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { BeatlineGame, HitMonitor, formatHits } from './beatline-game';

const SR = 48000;
const OFFSET = 0.1;
const SOUNDS: Record<string, HitSound> = { clap, tap };
const hand = getProfile('hand-percussion');
const single = getProfile('clap');
const model: TimbreModel = enrollSynthetic(hand, SOUNDS).model;

class Time implements TimeSource {
  currentTime = 0;
}

function drive(
  chart: Chart,
  profile = hand,
  m: TimbreModel | null = model,
  sounds: Record<string, HitSound> = SOUNDS,
  stopAt = Infinity,
) {
  const perf = renderPerformance(chart, percussionPerformer(sounds), {
    latency: OFFSET,
    ctxStart: 3.25,
  });
  const time = new Time();
  const clock = new SongClock(time);
  time.currentTime = perf.ctxStart;
  clock.start(perf.songStart);
  const game = new BeatlineGame({ chart, profile, clock, latencyOffset: OFFSET, model: m });
  const analyzer = new InputAnalyzer(SR, analyzerOptionsFromProfile(profile));
  const startFrame = Math.round(perf.ctxStart * SR);
  let nextFrame = perf.ctxStart + 1 / 60;
  for (let n = 0; n < perf.signal.length; n += 128) {
    const block = perf.signal.subarray(n, Math.min(n + 128, perf.signal.length));
    for (const msg of analyzer.process(block, startFrame + n)) game.handleMessage(msg);
    time.currentTime = perf.ctxStart + (n + block.length) / SR;
    while (time.currentTime >= nextFrame) {
      game.update();
      nextFrame += 1 / 60;
    }
    if (clock.now() >= stopAt) break;
  }
  return { game, clock, time };
}

describe('BeatlineGame', () => {
  const chart = getSong('clap-tap-groove');

  it('scores a full clap/tap run perfectly, each hit in its lane', () => {
    const { game } = drive(chart);
    game.update();
    game.session.finish();
    expect(game.session.score.counts).toEqual({ perfect: chart.notes.length, good: 0, miss: 0 });
    expect(game.strays).toBe(0);
    expect(game.monitor.total).toBe(chart.notes.length);
    expect(game.monitor.rejected).toBe(0);
  });

  it('flashes each hit in the lane it was classified into, at the time the player sees it', () => {
    // stop just after the first tap (note 1, at 0.667 s + latency)
    const first = chart.notes[1]!;
    const { game } = drive(chart, hand, model, SOUNDS, first.t + OFFSET + 0.15);
    const view = game.view();
    const lanes = view.hits!.map((h) => h.lane);
    expect(lanes).toEqual(['tap']); // the earlier clap flash has already faded out
    const tapFlash = view.hits!.at(-1)!;
    expect(tapFlash.time).toBeCloseTo(first.t, 2); // latency-corrected: where the note was, not where the sound was heard
    expect(tapFlash.velocity).toBeGreaterThan(0.3);
  });

  it('single-lane profiles flash every hit in the one lane without any classification', () => {
    const song = getSong('clap-basic');
    const { game } = drive(song, single, null, { hit: clap });
    game.update();
    expect(game.view().hits!.every((h) => h.lane === 'hit')).toBe(true);
    game.session.finish();
    expect(game.session.score.counts.miss).toBe(0);
  });

  it('a sound the model rejects is flashed as unknown and counted', () => {
    const { game } = drive(chart, hand, model, { clap, tap: shaker });
    const taps = chart.notes.filter((n) => n.lane === 'tap').length;
    expect(game.monitor.rejected).toBe(taps);
    expect(game.monitor.recent.some((r) => r.lane === '' && r.nearest !== null)).toBe(true);
    game.update();
    game.session.finish();
    expect(game.session.score.counts.miss).toBe(taps);
  });

  it('drops old flashes so the list does not grow forever', () => {
    const { game } = drive(chart);
    game.update();
    expect(game.view().hits!.length).toBeLessThan(chart.notes.length);
  });
});

describe('HitMonitor', () => {
  it('keeps only the latest hits and reports level and age', () => {
    const mon = new HitMonitor(single, null);
    for (let i = 0; i < 9; i++)
      mon.push({
        type: 'input',
        event: { time: i, kind: 'onset', velocity: 0.5, features: { centroid: 2000 } },
      });
    mon.push({
      type: 'frame',
      frame: { time: 9.5, pitchHz: null, clarity: 0, rmsDb: -30, peakDb: -12 },
    });
    expect(mon.total).toBe(9);
    expect(mon.recent).toHaveLength(6);
    expect(mon.recent[0]!.ctxTime).toBe(3);
    expect(mon.levelDb).toBe(-30);
    expect(mon.peakDb).toBe(-12);
    expect(mon.age(10)).toBeCloseTo(0.5);
    expect(new HitMonitor(single, null).age(1)).toBeNull();
    expect(mon.recent.every((r) => r.lane === 'hit')).toBe(true);
  });

  it('puts hits of a multi-lane profile with no model in no lane', () => {
    const mon = new HitMonitor(hand, null);
    const r = mon.push({ type: 'input', event: { time: 1, kind: 'onset', velocity: 1 } });
    expect(r!.record.lane).toBe('');
  });
});

describe('formatHits', () => {
  it('lists the newest hit first with its lane, distance and features', () => {
    const { game, clock } = drive(chart0(), hand, model, SOUNDS, 3);
    const text = formatHits(game.monitor, clock.now(), {
      songTime: clock.now(),
      offsetMs: 100,
      strays: 0,
    });
    expect(text).toMatch(/hits +\d+/);
    expect(text).toMatch(/clap|tap/);
    expect(text).toMatch(/Hz .*decay/);
    const lines = text.split('\n');
    expect(lines.findIndex((l) => /^\d/.test(l))).toBeGreaterThan(0);
  });

  it('says so when nothing has been heard', () => {
    const text = formatHits(new HitMonitor(single, null), 0);
    expect(text).toMatch(/no data yet/);
    expect(text).toMatch(/no hits yet/);
  });
});

function chart0(): Chart {
  return getSong('clap-tap-groove');
}

describe('strums (Strumline uses the same game)', () => {
  const strum = getProfile('ukulele-strum');
  const chart = getSong('strum-four-chords');
  const first = { ...chart, notes: chart.notes.slice(0, 12) } as Chart;

  function playStrums(checkChords: boolean) {
    const perf = renderPerformance(first, ukuleleStrumPerformer, {
      latency: OFFSET,
      ctxStart: 2.5,
    });
    const time = new Time();
    const clock = new SongClock(time);
    time.currentTime = perf.ctxStart;
    clock.start(perf.songStart);
    const game = new BeatlineGame({
      chart: first,
      profile: strum,
      clock,
      latencyOffset: OFFSET,
      model: null,
    });
    const analyzer = new InputAnalyzer(
      SR,
      analyzerOptionsFromProfile(
        strum,
        checkChords ? { chords: chordShapesFor(strum, chartChords(first)) } : {},
      ),
    );
    const startFrame = Math.round(perf.ctxStart * SR);
    let nextFrame = perf.ctxStart + 1 / 60;
    for (let n = 0; n < perf.signal.length; n += 128) {
      const block = perf.signal.subarray(n, Math.min(n + 128, perf.signal.length));
      for (const msg of analyzer.process(block, startFrame + n)) game.handleMessage(msg);
      time.currentTime = perf.ctxStart + (n + block.length) / SR;
      while (time.currentTime >= nextFrame) {
        game.update();
        nextFrame += 1 / 60;
      }
    }
    game.session.finish();
    return { game, time };
  }

  it('lights the whole now line for a strum, and remembers the chord it heard', () => {
    const { game } = playStrums(true);
    const hits = game.monitor.recent;
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.lane).toBe(ANY_LANE);
      expect(h.chord).toBe('C');
      expect(h.chordScore).toBeGreaterThan(0.8);
    }
    expect(game.view().hits?.every((f) => f.lane === ANY_LANE)).toBe(true);
  });

  it('scores the strums perfect with chord checking on or off', () => {
    for (const check of [true, false]) {
      const { game } = playStrums(check);
      expect(game.session.score.counts, `chords ${check}`).toEqual({
        perfect: 12,
        good: 0,
        miss: 0,
      });
    }
  });

  it('names the chord in the hit text, or a dash when timing only', () => {
    const on = playStrums(true);
    expect(formatHits(on.game.monitor, on.time.currentTime)).toMatch(/strum {2}chord C \(\d+%\)/);
    const off = playStrums(false);
    expect(formatHits(off.game.monitor, off.time.currentTime)).toMatch(/strum {2}chord –/);
  });
});
