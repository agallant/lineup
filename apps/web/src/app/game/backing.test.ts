import { SongClock, chartFromBeats } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { midiToHz, planBacking, playBacking, type AudioOut } from './backing';

const chart = chartFromBeats({ title: 'T', bpm: 120, countInBeats: 4 }, [
  { beat: 0, beats: 1, pitch: 60 },
  { beat: 1, beats: 2, pitch: 64 },
  { beat: 4, beats: 1, pitch: 67 },
]);

describe('planBacking', () => {
  it('always counts in: one click per beat before song time 0, first one accented', () => {
    const plan = planBacking(chart, { metronome: false, guideTone: false });
    expect(plan).toEqual([
      { kind: 'click', songTime: -2, accent: true },
      { kind: 'click', songTime: -1.5, accent: false },
      { kind: 'click', songTime: -1, accent: false },
      { kind: 'click', songTime: -0.5, accent: false },
    ]);
  });

  it('adds a beat click through the end of the song when the metronome is on, accenting each bar', () => {
    const clicks = planBacking(chart, { metronome: true, guideTone: false }).filter(
      (e) => e.songTime >= 0,
    );
    expect(clicks.map((e) => e.songTime)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]); // the last note ends at 2.5 s
    expect(clicks.filter((e) => e.kind === 'click' && e.accent).map((e) => e.songTime)).toEqual([
      0, 2,
    ]);
  });

  it('adds guide tones at each note with its pitch and length', () => {
    const tones = planBacking(chart, { metronome: false, guideTone: true }).filter(
      (e) => e.kind === 'tone',
    );
    expect(tones).toEqual([
      { kind: 'tone', songTime: 0, duration: 0.5, midi: 60 },
      { kind: 'tone', songTime: 0.5, duration: 1, midi: 64 },
      { kind: 'tone', songTime: 2, duration: 0.5, midi: 67 },
    ]);
  });

  it('is sorted by time', () => {
    const plan = planBacking(chart, { metronome: true, guideTone: true });
    expect(plan.map((e) => e.songTime)).toEqual(
      [...plan.map((e) => e.songTime)].sort((a, b) => a - b),
    );
  });

  it('has no count-in for a chart that asks for none', () => {
    const c = chartFromBeats({ title: 'T', bpm: 120, countInBeats: 0 }, [{ beat: 0, pitch: 60 }]);
    expect(planBacking(c, { metronome: false, guideTone: false })).toEqual([]);
  });
});

describe('midiToHz', () => {
  it.each([
    [69, 440],
    [60, 261.6256],
    [81, 880],
  ])('%d -> %f', (m, hz) => expect(midiToHz(m)).toBeCloseTo(hz, 3));
});

/** Records what was scheduled, in AudioContext time. */
function fakeAudio(currentTime: number) {
  const started: { freq: number; at: number }[] = [];
  const stopped: number[] = [];
  const ctx: AudioOut = {
    currentTime,
    destination: {} as AudioNode,
    createGain: () =>
      ({
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect: (n: AudioNode) => n,
      }) as unknown as GainNode,
    createOscillator: () => {
      const o = {
        frequency: { value: 0 },
        connect: (g: { connect: (n: AudioNode) => AudioNode }) => g,
        start(at: number) {
          started.push({ freq: o.frequency.value, at });
        },
        stop(at?: number) {
          stopped.push(at ?? -1);
        },
      };
      return o as unknown as OscillatorNode;
    },
  };
  return { ctx, started, stopped };
}

describe('playBacking', () => {
  it('maps song time to audio time through the clock and schedules every future event', () => {
    const { ctx, started } = fakeAudio(10);
    const clock = new SongClock({ currentTime: 10 });
    clock.start(-2, 10.5); // song time 0 happens at audio time 12.5
    const events = planBacking(chart, { metronome: false, guideTone: true });
    playBacking(ctx, clock, events);
    const clickTimes = started.filter((s) => s.freq === 1000 || s.freq === 1500).map((s) => s.at);
    expect(clickTimes).toEqual([10.5, 11, 11.5, 12]);
    const tones = started.filter((s) => s.freq < 900);
    expect(tones.map((t) => [Math.round(t.freq), t.at])).toEqual([
      [262, 12.5],
      [330, 13],
      [392, 14.5],
    ]);
  });

  it('skips events already in the past and stops everything on request', () => {
    const { ctx, started, stopped } = fakeAudio(12);
    const clock = new SongClock({ currentTime: 12 });
    clock.start(-2, 10); // started 2 s ago
    const handle = playBacking(
      ctx,
      clock,
      planBacking(chart, { metronome: false, guideTone: true }),
    );
    expect(started.every((s) => s.at >= 11.98)).toBe(true);
    // song time 0 is audio time 12 = now: the four count-in clicks (audio 10-11.5) are past, the 3 tones remain
    expect(started).toHaveLength(3);
    const before = stopped.length;
    handle.stop();
    expect(stopped.length).toBeGreaterThan(before);
  });
});
