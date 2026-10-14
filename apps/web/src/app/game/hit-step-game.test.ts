import { getProfile, getSong } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { HitStepGame } from './hit-step-game';

const strum = getProfile('ukulele-strum');
const four = getSong('strum-four-chords');

describe('HitStepGame: strumming', () => {
  it('makes one step of each run of the same chord', () => {
    const g = new HitStepGame(four, strum);
    const chords = g.steps.map((s) => s.chord);
    expect(chords.slice(0, 4)).toEqual(['C', 'Am', 'F', 'G']);
    expect(g.steps.length).toBeLessThan(four.notes.length);
    expect(g.steps[0]!.count).toBeGreaterThan(1);
    expect(g.prompt).toMatch(/^Strum C \d+ times$/);
    expect(g.labels[1]).toMatch(/^Am ×\d+/);
  });

  it('any strum passes when chords are not checked, once for each time asked', () => {
    const g = new HitStepGame(four, strum);
    const n = g.steps[0]!.count;
    for (let i = 0; i < n - 1; i++) expect(g.feed({ time: 1 + i })).toBe(false);
    expect(g.index).toBe(0);
    expect(g.feed({ time: 9 })).toBe(true);
    expect(g.index).toBe(1);
  });

  it('with chord checking, only the right chord counts and the rest are wrong', () => {
    const g = new HitStepGame(four, strum, { needChord: true });
    const n = g.steps[0]!.count;
    expect(g.feed({ time: 1, chord: 'G' })).toBe(false);
    expect(g.wrong).toBe(1);
    for (let i = 0; i < n - 1; i++) g.feed({ time: 2 + i, chord: 'C' });
    expect(g.feed({ time: 9, chord: 'C' })).toBe(true);
  });

  it('ignores hits while the step is sounding', () => {
    const g = new HitStepGame(four, strum);
    g.muteUntil(5);
    for (let i = 0; i < 20; i++) g.feed({ time: 1 });
    expect(g.index).toBe(0);
  });

  it('skip, finish and report the share passed', () => {
    const g = new HitStepGame(four, strum);
    g.skip();
    while (!g.done) while (!g.feed({ time: 10 }) && !g.done) void 0;
    expect(g.skipped).toBe(1);
    expect(g.accuracy).toBeCloseTo((g.steps.length - 1) / g.steps.length);
    expect(g.step).toBeNull();
    expect(g.view().time).toBeGreaterThan(0);
  });
});

describe('HitStepGame: drums', () => {
  const kit = getProfile('drum-kit');
  const rock = getSong('drum-rock');

  it('asks each drum sound, a run of the same one as one step', () => {
    const g = new HitStepGame(rock, kit);
    expect(g.steps.every((s) => s.lane !== null)).toBe(true);
    expect(new Set(g.steps.map((s) => s.lane)).size).toBeGreaterThan(1);
    expect(g.prompt).toMatch(/^Hit the \w+/);
  });

  it('counts the wrong drum', () => {
    const g = new HitStepGame(rock, kit);
    const want = g.step!.lane!;
    const other = g.steps.find((s) => s.lane !== want)!.lane!;
    expect(g.feed({ time: 1, lane: other })).toBe(false);
    expect(g.wrong).toBe(1);
    for (let i = 0; i < g.step!.count; i++) g.feed({ time: 2 + i, lane: want });
    expect(g.index).toBe(1);
  });
});

describe('HitStepGame: a single sound', () => {
  it('every note is a step when there is only one lane', () => {
    const clap = getSong('clap-basic');
    const g = new HitStepGame(clap, getProfile('clap'));
    expect(g.steps).toHaveLength(clap.notes.length);
    expect(g.prompt).toBe('Play it');
  });
});
