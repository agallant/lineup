import { getProfile, getSong, midiToFrequency, type PitchFrame } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { StepGame } from './step-game';

const chart = getSong('sing-mary-lamb');
const profile = getProfile('voice');
const frame = (time: number, midi: number | null, clarity = 0.95): PitchFrame => ({
  time,
  frequency: midi === null ? null : midiToFrequency(midi),
  clarity,
  level: -20,
});

/** Sings `midi` from `from` for `seconds`, one frame per 10 ms. Returns the time reached. */
function sing(g: StepGame, midi: number | null, from: number, seconds: number): number {
  let t = from;
  for (; t < from + seconds; t += 0.01) g.feed(frame(t, midi));
  return t;
}

describe('StepGame', () => {
  it('asks the notes in order and passes each when held on pitch', () => {
    const g = new StepGame(chart, profile);
    expect(g.index).toBe(0);
    let t = 0;
    for (let i = 0; i < 3; i++) {
      const target = g.target!;
      t = sing(g, target, t, 0.6);
      expect(g.index).toBe(i + 1);
    }
    expect(g.passed).toBe(3);
  });

  it('does not pass a wrong or a too-brief note', () => {
    const g = new StepGame(chart, profile);
    const target = g.target!;
    let t = sing(g, target + 3, 0, 1);
    expect(g.index).toBe(0);
    t = sing(g, target, t, 0.2); // not held long enough
    t = sing(g, null, t, 0.4); // silence breaks the hold
    sing(g, target, t, 0.2);
    expect(g.index).toBe(0);
  });

  it('is forgiving: a short wobble does not break the hold', () => {
    const g = new StepGame(chart, profile);
    const target = g.target!;
    let t = sing(g, target, 0, 0.2);
    t = sing(g, null, t, 0.08);
    sing(g, target, t, 0.4);
    expect(g.index).toBe(1);
  });

  it('accepts the note an octave away for a voice', () => {
    const g = new StepGame(chart, profile);
    sing(g, g.target! - 12, 0, 0.6);
    expect(g.index).toBe(1);
  });

  it('ignores the input while a note is sounding', () => {
    const g = new StepGame(chart, profile);
    g.muteUntil(1);
    sing(g, g.target!, 0, 0.9);
    expect(g.index).toBe(0);
    sing(g, g.target!, 1, 0.6);
    expect(g.index).toBe(1);
  });

  it('skipping counts as a miss; finishing reports the share passed', () => {
    const g = new StepGame(chart, profile);
    g.skip();
    expect(g.statuses[0]).toBe('miss');
    let t = 0;
    while (!g.done) t = sing(g, g.target!, t, 0.6);
    expect(g.skipped).toBe(1);
    expect(g.passed).toBe(g.notes.length - 1);
    expect(g.accuracy).toBeCloseTo((g.notes.length - 1) / g.notes.length);
    expect(g.target).toBeNull();
    g.skip(); // harmless once finished
    expect(g.view().live?.noteIndex).toBeNull();
  });

  it('draws the asked note at the line with the recent pitch behind it', () => {
    const g = new StepGame(chart, profile);
    sing(g, g.target! + 5, 0, 0.3);
    const v = g.view();
    expect(v.time).toBeCloseTo(g.notes[0]!.t + 0.01);
    expect(v.trail!.length).toBeGreaterThan(10);
    expect(Math.max(...v.trail!.map((p) => p.time))).toBeCloseTo(v.time);
    expect(v.live?.noteIndex).toBe(0);
  });
});
