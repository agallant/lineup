import { describe, expect, it } from 'vitest';
import type { Grade, Judgment } from './judge/types';
import { Scoreboard, letterGrade } from './scoring';

const j = (grade: Grade, credit?: number): Judgment => ({
  noteIndex: 0,
  note: { t: 0, duration: 0 },
  grade,
  credit: credit ?? (grade === 'perfect' ? 1 : grade === 'good' ? 0.5 : 0),
  timingError: null,
  reason: null,
  resolvedAt: 0,
});

describe('Scoreboard', () => {
  it('scores perfects at 100, goods at 50, misses at 0 (multiplier 1 early on)', () => {
    const s = new Scoreboard();
    s.add(j('perfect'));
    s.add(j('good'));
    s.add(j('miss'));
    expect(s.state).toMatchObject({
      score: 150,
      combo: 0,
      maxCombo: 2,
      judged: 3,
      counts: { perfect: 1, good: 1, miss: 1 },
    });
    expect(s.state.accuracy).toBeCloseTo(0.5, 12);
  });

  it('a miss resets the combo but keeps the max', () => {
    const s = new Scoreboard();
    for (let i = 0; i < 5; i++) s.add(j('perfect'));
    s.add(j('miss'));
    s.add(j('perfect'));
    expect(s.state.combo).toBe(1);
    expect(s.state.maxCombo).toBe(5);
  });

  it('the multiplier grows every 10 notes up to the cap', () => {
    const s = new Scoreboard();
    const run = (n: number) => {
      for (let i = 0; i < n; i++) s.add(j('perfect'));
    };
    run(9);
    expect(s.state.multiplier).toBe(1);
    run(1);
    expect(s.state.multiplier).toBeCloseTo(1.1, 12);
    run(200);
    expect(s.state.multiplier).toBe(2);
  });

  it('points use the multiplier earned before the note (note 11 is the first at x1.1)', () => {
    const s = new Scoreboard();
    for (let i = 0; i < 10; i++) s.add(j('perfect'));
    expect(s.state.score).toBe(1000);
    s.add(j('perfect'));
    expect(s.state.score).toBe(1110);
  });

  it('supports fractional credit (continuous judging)', () => {
    const s = new Scoreboard();
    s.add(j('good', 0.73));
    expect(s.state.score).toBe(73);
    expect(s.state.accuracy).toBeCloseTo(0.73, 12);
  });

  it('is zeroed when empty', () => {
    expect(new Scoreboard().state).toMatchObject({
      score: 0,
      accuracy: 0,
      judged: 0,
      multiplier: 1,
    });
  });
});

describe('letterGrade', () => {
  it.each([
    [1, 'S'],
    [0.95, 'S'],
    [0.9, 'A'],
    [0.85, 'A'],
    [0.7, 'B'],
    [0.5, 'C'],
    [0.49, 'D'],
    [0, 'D'],
  ] as const)('%d -> %s', (acc, grade) => {
    expect(letterGrade(acc)).toBe(grade);
  });
});
