import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, levelFor, type PlayOutcome } from '../progress';
import { jingleFor, jingleNotes, playJingle } from './jingle';

const outcome = (patch: Partial<PlayOutcome> = {}): PlayOutcome => ({
  xpGained: 10,
  level: levelFor(10),
  leveledUp: false,
  streak: 1,
  dailyBonus: 0,
  newAchievements: [],
  freezeUsed: false,
  freezeEarned: false,
  freezes: 0,
  week: { themeId: 'waltz', plays: 0, goal: 3, counted: false, justDone: false, bonus: 0 },
  ...patch,
});

describe('jingleFor', () => {
  it('picks the biggest thing that happened', () => {
    expect(jingleFor(outcome({ leveledUp: true, newAchievements: [ACHIEVEMENTS[0]!] }), true)).toBe(
      'level-up',
    );
    expect(jingleFor(outcome({ newAchievements: [ACHIEVEMENTS[0]!], dailyBonus: 50 }), true)).toBe(
      'trophy',
    );
    expect(jingleFor(outcome({ dailyBonus: 50 }), true)).toBe('daily');
    expect(jingleFor(outcome(), true)).toBe('new-best');
    expect(jingleFor(outcome(), false)).toBeNull();
    expect(jingleFor(null, true)).toBe('new-best'); // no progress to report, still a new best
  });
});

describe('playJingle', () => {
  it('schedules every note once on the audio clock, softly', () => {
    const started: number[] = [];
    const ctx = {
      currentTime: 10,
      destination: {} as AudioNode,
      createOscillator: () =>
        ({
          type: 'sine',
          frequency: { value: 0 },
          connect: (n: unknown) => n,
          start: (t: number) => started.push(t),
          stop: () => undefined,
        }) as unknown as OscillatorNode,
      createGain: () =>
        ({
          gain: {
            setValueAtTime: () => undefined,
            linearRampToValueAtTime: (v: number) => expect(v).toBeLessThanOrEqual(0.2),
            exponentialRampToValueAtTime: () => undefined,
          },
          connect: (n: unknown) => n,
        }) as unknown as GainNode,
    };
    playJingle(ctx, 'level-up');
    expect(started).toHaveLength(jingleNotes('level-up').length);
    expect(started.every((t) => t >= 10)).toBe(true);
    expect(started).toEqual([...started].sort((a, b) => a - b));
  });
});
