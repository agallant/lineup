import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, levelFor, type PlayOutcome } from '../progress';
import { rewardHtml } from './reward';

/** An outcome with nothing special about it, with `patch` on top. */
const outcome = (patch: Partial<PlayOutcome>): PlayOutcome => ({
  xpGained: 30,
  level: levelFor(30),
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

describe('rewardHtml', () => {
  it('shows stars, XP, level, streak and new trophies', () => {
    const html = rewardHtml(
      0.97,
      outcome({
        xpGained: 140,
        level: levelFor(350),
        leveledUp: true,
        streak: 3,
        dailyBonus: 50,
        newAchievements: [ACHIEVEMENTS[0]!],
      }),
    );
    expect(html).toContain('★★★');
    expect(html).toContain('+140 XP');
    expect(html).toContain('Level 3 Student');
    expect(html).toContain('3-day streak');
    expect(html).toContain('Level up!');
    expect(html).toContain('Daily challenge cleared! +50 XP');
    expect(html).toContain('First notes');
  });

  it('stays quiet when there is nothing new', () => {
    const html = rewardHtml(0.5, outcome({}));
    expect(html).toContain('☆☆☆');
    expect(html).not.toContain('Level up');
    expect(html).not.toContain('Daily challenge');
    expect(html).not.toContain('streak');
    expect(html).not.toContain('new-trophies');
  });
});
