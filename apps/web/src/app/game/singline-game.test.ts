import {
  SongClock,
  getProfile,
  getSong,
  midiToFrequency,
  type Chart,
  type TimeSource,
} from '@lineup/core';
import { InputAnalyzer, analyzerOptionsFromProfile } from '@lineup/input';
import { renderPerformance, voicePerformer, type VoicePerformerOptions } from '@lineup/sim';
import { describe, expect, it } from 'vitest';
import { SinglineGame } from './singline-game';

const profile = getProfile('voice');
const chart: Chart = getSong('singline-scale');
const SR = 48000;
const OFFSET = 0.12;

class Time implements TimeSource {
  currentTime = 0;
}

/** Runs a synthetic singer through the real analyzer into the game, up to `stopAt` song seconds (or the end). */
function drive(singer: VoicePerformerOptions = {}, stopAt = Infinity, game_chart: Chart = chart) {
  const perf = renderPerformance(game_chart, voicePerformer(singer), {
    latency: OFFSET,
    ctxStart: 7.5,
  });
  const time = new Time();
  const clock = new SongClock(time);
  time.currentTime = perf.ctxStart;
  clock.start(perf.songStart);
  const game = new SinglineGame({
    chart: game_chart,
    profile,
    clock,
    latencyOffset: OFFSET,
    hop: profile.detector.hopSize / SR,
  });
  const analyzer = new InputAnalyzer(SR, analyzerOptionsFromProfile(profile));
  const startFrame = Math.round(perf.ctxStart * SR);
  let nextFrame = perf.ctxStart + 1 / 60;
  for (let n = 0; n < perf.signal.length; n += 128) {
    const block = perf.signal.subarray(n, Math.min(n + 128, perf.signal.length));
    for (const m of analyzer.process(block, startFrame + n)) game.handleMessage(m);
    time.currentTime = perf.ctxStart + (n + block.length) / SR;
    while (time.currentTime >= nextFrame) {
      game.update();
      nextFrame += 1 / 60;
    }
    if (clock.now() >= stopAt) break;
  }
  return { game, clock, time };
}

describe('SinglineGame', () => {
  it('scores a full run exactly like the headless pipeline: all 12 notes perfect', () => {
    const { game } = drive();
    game.update();
    game.session.finish();
    expect(game.session.score.counts).toEqual({ perfect: 12, good: 0, miss: 0 });
    expect(game.session.statuses.every((s) => s === 'perfect')).toBe(true);
  });

  it('mid-song: the active note, live feedback and the trail agree with what is being sung', () => {
    // note 3 (F4 = 65) starts at 3 beats * 0.75 s = 2.25 s, lasts ~0.63 s; stop in the middle of it
    const stopAt = 2.25 + OFFSET + 0.4; // +offset: the singer is 120 ms late, the view compensates
    const { game, clock, time } = drive({}, stopAt);
    const view = game.view();
    expect(view.live?.noteIndex).toBe(3);
    expect(view.live?.onPitch).toBe(true);
    expect(view.live!.coverage).toBeGreaterThan(0.6);
    expect(view.statuses.slice(0, 3)).toEqual(['perfect', 'perfect', 'perfect']);
    expect(view.statuses[3]).toBe('pending');
    expect(view.time).toBeCloseTo(clock.now() - OFFSET, 9);

    const head = view.trail!.at(-1)!;
    expect(head.midi).toBeCloseTo(65, 0);
    expect(head.onPitch).toBe(true);
    // trail points are in (latency-corrected) song time, ending near the view time
    expect(Math.abs(head.time - view.time)).toBeLessThan(0.1);

    const d = game.debug(time.currentTime);
    expect(d.target).toBe('F4');
    expect(d.note).toBe('F4');
    expect(d.hz).toBeCloseTo(midiToFrequency(65), 0);
    expect(Math.abs(d.cents!)).toBeLessThan(15);
    expect(d.voiced).toBe(true);
    expect(d.octaves).toBe(0);
    expect(Math.abs(d.deviation!)).toBeLessThan(15);
    expect(d.frameRate).toBeGreaterThan(150); // ~187 frames/s at 256-sample hops
    expect(d.latencyOffsetMs).toBe(120);
    expect(d.frameAge).toBeLessThan(0.05);
  });

  it('an octave-lower singer: the debug view shows -1 octave, the trail is folded next to the target, scoring is unaffected', () => {
    const stopAt = 2.25 + OFFSET + 0.4;
    const { game, time } = drive({ octaveShift: -12 }, stopAt);
    const d = game.debug(time.currentTime);
    expect(d.octaves).toBe(-1);
    expect(Math.abs(d.deviation!)).toBeLessThan(15); // octave-forgiving
    const head = game.view().trail!.at(-1)!;
    expect(head.midi).toBeCloseTo(65, 0); // folded to the target's octave for display
    expect(head.onPitch).toBe(true);
    expect(game.view().live?.onPitch).toBe(true);
  });

  it('flat singing is shown as off pitch: orange trail, no glow, deviation reported', () => {
    const { game, time } = drive({ detuneCents: -90 }, 2.25 + OFFSET + 0.4);
    const head = game.view().trail!.at(-1)!;
    expect(head.onPitch).toBe(false);
    expect(game.view().live?.onPitch).toBe(false);
    const d = game.debug(time.currentTime);
    expect(d.deviation!).toBeLessThan(-70);
    expect(d.deviation!).toBeGreaterThan(-110);
  });

  it('silence leaves gaps in the trail and an empty debug reading', () => {
    const { game, time } = drive({}, -1); // during the count-in, before anything is sung
    const view = game.view();
    expect(view.trail!.length).toBeGreaterThan(10);
    expect(view.trail!.every((p) => p.midi === null)).toBe(true);
    const d = game.debug(time.currentTime);
    expect(d.hz).toBeNull();
    expect(d.voiced).toBe(false);
    expect(d.target).toBeNull();
    expect(d.deviation).toBeNull();
  });

  it('ignores non-frame messages and tolerates being queried before any input', () => {
    const time = new Time();
    const clock = new SongClock(time);
    clock.start(0);
    const game = new SinglineGame({ chart, profile, clock, latencyOffset: 0, hop: 256 / SR });
    game.handleMessage({ type: 'input', event: { time: 1, kind: 'onset' } });
    expect(game.view().trail).toEqual([]);
    expect(game.debug(0)).toMatchObject({ hz: null, frameAge: null, frameRate: 0, voiced: false });
  });
});
