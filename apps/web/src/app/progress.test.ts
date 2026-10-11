import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  DAILY_BONUS,
  ProgressStore,
  dayKey,
  gameOf,
  levelFor,
  starText,
  starsFor,
  streakOf,
  xpFor,
  type PlayResult,
} from './progress';

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const play = (patch: Partial<PlayResult> = {}): PlayResult => ({
  profileId: 'voice',
  songId: 'sing-hot-cross-buns',
  accuracy: 0.9,
  rating: 3,
  chromatic: false,
  misses: 2,
  notes: 16,
  ...patch,
});
const at = (day: number) => new Date(2026, 9, day, 12); // October

describe('levels and stars', () => {
  it('starts at level 1 and gets harder: 100, 300, 600, 1000 XP', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, title: 'Listener', into: 0, span: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100).level).toBe(2);
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(300)).toMatchObject({ level: 3, into: 0, span: 300 });
    expect(levelFor(1000).level).toBe(5);
    expect(levelFor(1e8).title).toBe('Legend');
  });

  it('gives stars from accuracy', () => {
    expect([0.3, 0.6, 0.8, 0.95, 1].map(starsFor)).toEqual([0, 1, 2, 3, 3]);
    expect(starText(2)).toBe('★★☆');
  });

  it('knows which game a profile belongs to', () => {
    expect(gameOf('voice')?.label).toBe('Singline');
    expect(gameOf('drum-kit')?.label).toBe('Beatline');
    expect(gameOf('ukulele-strum')?.label).toBe('Strumline');
    expect(gameOf('wind')?.label).toBe('Windline');
    expect(gameOf('nope')).toBeNull();
  });
});

describe('xpFor', () => {
  it('pays more for accuracy and for harder songs, with a clean-run bonus', () => {
    expect(xpFor(play({ accuracy: 0.5 }))).toBeLessThan(xpFor(play({ accuracy: 0.9 })));
    expect(xpFor(play({ rating: 2 }))).toBeLessThan(xpFor(play({ rating: 8 })));
    expect(xpFor(play({ accuracy: 1, misses: 0 }))).toBeGreaterThan(
      xpFor(play({ accuracy: 1, misses: 3 })),
    );
    expect(xpFor(play({ accuracy: 0 }))).toBe(0);
    expect(xpFor(play({ accuracy: 1, rating: 10, misses: 0 }))).toBeLessThanOrEqual(600);
  });
});

describe('streakOf', () => {
  it('counts days in a row up to today, or up to yesterday', () => {
    const days = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
    expect(streakOf(days, at(10))).toBe(4);
    expect(streakOf(days, at(11))).toBe(4); // not yet played today
    expect(streakOf(days, at(12))).toBe(0); // missed a day
    expect(streakOf(['2026-10-01', '2026-10-09', '2026-10-10'], at(10))).toBe(2);
    expect(streakOf([], at(10))).toBe(0);
  });

  it('formats local dates', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('daily challenges', () => {
  it('pay a bonus once per game per day, only from 60% accuracy', () => {
    const p = new ProgressStore(new Mem());
    const daily = { key: '2026-10-01|singline' };
    const poor = p.recordPlay(play({ accuracy: 0.4, daily }), at(1));
    expect(poor.dailyBonus).toBe(0);
    const cleared = p.recordPlay(play({ daily }), at(1));
    expect(cleared.dailyBonus).toBe(DAILY_BONUS);
    expect(cleared.newAchievements.map((a) => a.id)).toContain('daily-first');
    expect(p.recordPlay(play({ daily }), at(1)).dailyBonus).toBe(0); // already cleared
    expect(p.recordPlay(play(), at(1)).dailyBonus).toBe(0); // not a daily
    expect(p.get().dailies).toEqual(['2026-10-01|singline']);
  });

  it('earn the Dedicated trophy at seven, and ignore junk in storage', () => {
    const mem = new Mem();
    const p = new ProgressStore(mem);
    let last = false;
    for (let d = 1; d <= 7; d++) {
      const out = p.recordPlay(play({ daily: { key: `2026-10-0${d}|strumline` } }), at(d));
      last = out.newAchievements.some((a) => a.id === 'daily-seven');
    }
    expect(last).toBe(true);
    mem.data.set('lineup.progress.v1', '{"dailies": ["2026-10-01|beatline", "nope", 4]}');
    expect(new ProgressStore(mem).get().dailies).toEqual(['2026-10-01|beatline']);
  });
});

describe('ProgressStore with two tabs', () => {
  it('does not erase what another tab saved', () => {
    const mem = new Mem();
    const tabA = new ProgressStore(mem);
    const tabB = new ProgressStore(mem); // loaded before A plays
    tabA.recordPlay(play({ songId: 'a' }), at(1));
    tabB.recordPlay(play({ songId: 'b' }), at(1));
    const fresh = new ProgressStore(mem).get();
    expect(fresh.plays).toBe(2);
    expect(fresh.songs.sort()).toEqual(['voice|a', 'voice|b']);
  });
});

describe('ProgressStore', () => {
  it('records plays: XP, day bonus once a day, level ups and the first achievements', () => {
    const p = new ProgressStore(new Mem());
    const first = p.recordPlay(play(), at(1));
    expect(first.xpGained).toBe(xpFor(play()) + 20);
    expect(first.newAchievements.map((a) => a.id)).toContain('first-song');
    const second = p.recordPlay(play(), at(1));
    expect(second.xpGained).toBe(xpFor(play())); // no second day bonus
    expect(second.newAchievements).toEqual([]); // each is earned once
    expect(p.get().plays).toBe(2);
    expect(p.get().songs).toEqual(['voice|sing-hot-cross-buns']); // distinct songs
    expect(p.get().perGame).toEqual({ singline: 2 });
  });

  it('earns achievements for streaks, clean runs, hard songs and playing every game', () => {
    const p = new ProgressStore(new Mem());
    const ids = new Set<string>();
    const note = (day: number, r: Partial<PlayResult>) =>
      p.recordPlay(play(r), at(day)).newAchievements.forEach((a) => ids.add(a.id));
    note(1, { profileId: 'voice' });
    note(2, { profileId: 'wind', songId: 'a' });
    note(3, { profileId: 'clap', songId: 'b', accuracy: 1, misses: 0 });
    note(4, { profileId: 'ukulele-strum', songId: 'c', rating: 8, accuracy: 0.85 });
    note(5, { chromatic: true, songId: 'd' });
    note(6, { songId: 'e' });
    note(7, { songId: 'f' });
    for (const id of [
      'first-song',
      'three-stars',
      'flawless',
      'tough',
      'chromatic',
      'all-games',
      'streak-3',
      'streak-7',
    ])
      expect(ids, id).toContain(id);
    expect(ids.size).toBeLessThan(ACHIEVEMENTS.length); // not the ones that are far off
  });

  it('persists, exports and imports a backup, and survives bad storage', () => {
    const mem = new Mem();
    const p = new ProgressStore(mem);
    p.recordPlay(play(), at(1));
    expect(new ProgressStore(mem).get().plays).toBe(1);
    const backup = p.exportJson();
    p.clear();
    expect(p.get().plays).toBe(0);
    expect(p.importJson(backup)).toBe(true);
    expect(p.get().plays).toBe(1);
    expect(p.importJson('not json')).toBe(false);
    expect(p.importJson('{"plays": 5}')).toBe(false); // not one of ours
    expect(p.get().plays).toBe(1);
    mem.data.set('lineup.progress.v1', '{"xp": -5, "plays": "many", "days": [1, "2026-10-01"]}');
    expect(new ProgressStore(mem).get()).toMatchObject({ xp: 0, plays: 0, days: ['2026-10-01'] });
    const blocked = new ProgressStore(null);
    expect(blocked.recordPlay(play(), at(1)).xpGained).toBeGreaterThan(0);
  });
});
