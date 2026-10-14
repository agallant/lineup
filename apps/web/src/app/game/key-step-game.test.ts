import { KEY_PIECES, getProfile } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { KeyStepGame } from './key-step-game';

const profile = getProfile('keyboard');
const chords = KEY_PIECES['keys-chords-c-f-g']!;
const tune = KEY_PIECES['keys-hands-ode']!;

describe('KeyStepGame', () => {
  it('groups notes that start together into one step', () => {
    const g = new KeyStepGame(chords, profile);
    expect(g.steps.length).toBeLessThan(chords.notes.length);
    expect(g.steps.some((s) => s.pitches.length >= 3)).toBe(true);
  });

  it('passes a step when its keys are pressed, in any order', () => {
    const g = new KeyStepGame(chords, profile);
    const keys = [...g.target];
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (const k of keys.slice(0, -1)) expect(g.press(k)).toBe(false);
    expect(g.index).toBe(0);
    expect(g.press(keys[keys.length - 1]!)).toBe(true);
    expect(g.index).toBe(1);
    expect(g.passed).toBe(1);
  });

  it('counts keys that were not asked, and does not advance', () => {
    const g = new KeyStepGame(tune, profile);
    g.press(g.target[0]! + 1);
    expect(g.wrong).toBe(1);
    expect(g.index).toBe(0);
  });

  it('skips, finishes and reports the share passed', () => {
    const g = new KeyStepGame(tune, profile);
    g.skip();
    while (!g.done) for (const k of [...g.target]) g.press(k);
    expect(g.skipped).toBe(1);
    expect(g.passed).toBe(g.steps.length - 1);
    expect(g.accuracy).toBeCloseTo((g.steps.length - 1) / g.steps.length);
    expect(g.target).toEqual([]);
    g.skip();
    g.press(60); // harmless once finished
  });

  it('draws the asked notes at the keyboard with held keys lit', () => {
    const g = new KeyStepGame(tune, profile);
    g.press(60);
    expect(g.view().pressed).toEqual([60]);
    expect(g.view().time).toBeCloseTo(g.steps[0]!.t + 0.01);
    g.release(60);
    expect(g.view().pressed).toEqual([]);
  });
});
