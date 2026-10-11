import { getSong, rateChart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { DAILY_GAMES, dailyFor, dailyKey, wantsDaily } from './daily';

const day = (d: number) => new Date(2026, 9, d, 9);

describe('dailyFor', () => {
  it('is the same all day and for everyone, and new the next day', () => {
    for (const g of DAILY_GAMES) {
      expect(dailyFor(g, day(11))).toEqual(dailyFor(g, new Date(2026, 9, 11, 23, 59)));
      expect(dailyFor(g, day(11)).id).not.toBe(dailyFor(g, day(12)).id);
    }
  });

  it('makes a real song for each game, at the level of the weekday', () => {
    for (const g of DAILY_GAMES) {
      for (let d = 4; d <= 10; d++) {
        const daily = dailyFor(g, day(d)); // a week: every weekday
        const chart = getSong(daily.id);
        expect(rateChart(chart).score).toBeGreaterThanOrEqual(1);
        expect(daily.id).toContain(daily.spec.level);
        expect(daily.href).toMatch(/^#\/(sing|wind|strum|beat)\?daily$/);
      }
    }
    expect(dailyFor('singline', day(11)).spec.level).toBe('easy'); // Sunday
    expect(dailyFor('singline', day(16)).spec.level).toBe('hard'); // Friday
  });

  it('files a clear by day and game', () => {
    expect(dailyKey('singline', day(11))).toBe('2026-10-11|singline');
  });

  it('knows when the page was opened from the daily link', () => {
    expect(wantsDaily('#/sing?daily')).toBe(true);
    expect(wantsDaily('#/sing?x=1&daily')).toBe(true);
    expect(wantsDaily('#/sing')).toBe(false);
    expect(wantsDaily('#/sing?dailyx')).toBe(false);
  });
});
