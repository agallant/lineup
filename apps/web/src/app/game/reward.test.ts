import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, levelFor } from '../progress';
import { rewardHtml } from './reward';

describe('rewardHtml', () => {
  it('shows stars, XP, level, streak and new trophies', () => {
    const html = rewardHtml(0.97, {
      xpGained: 140,
      level: levelFor(350),
      leveledUp: true,
      streak: 3,
      newAchievements: [ACHIEVEMENTS[0]!],
    });
    expect(html).toContain('★★★');
    expect(html).toContain('+140 XP');
    expect(html).toContain('Level 3 Student');
    expect(html).toContain('3-day streak');
    expect(html).toContain('Level up!');
    expect(html).toContain('First notes');
  });

  it('stays quiet when there is nothing new', () => {
    const html = rewardHtml(0.5, {
      xpGained: 30,
      level: levelFor(30),
      leveledUp: false,
      streak: 1,
      newAchievements: [],
    });
    expect(html).toContain('☆☆☆');
    expect(html).not.toContain('Level up');
    expect(html).not.toContain('streak');
    expect(html).not.toContain('new-trophies');
  });
});
