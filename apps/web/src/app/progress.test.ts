import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { THEMES, themeForWeek, weekStart } from './themes';
import {
  ACHIEVEMENTS,
  DAILY_BONUS,
  FREEZE_EVERY,
  MAX_FREEZES,
  ProgressStore,
  dayKey,
  gameOf,
  levelFor,
  recentDays,
  starText,
  starsFor,
  streakOf,
  weekMinutes,
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
    expect(gameOf('ear')?.label).toBe('Ear training');
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

describe('grant', () => {
  it('awards a trophy once, from outside a song, and keeps it', () => {
    const mem = new Mem();
    const p = new ProgressStore(mem);
    expect(p.grant('graduate', at(1))?.title).toBe('Graduate');
    expect(p.grant('graduate', at(2))).toBeNull(); // already earned
    expect(p.grant('no-such-trophy')).toBeNull();
    expect(new ProgressStore(mem).get().achievements['graduate']).toBeDefined();
    // a finished song never grants it by itself
    const q = new ProgressStore(new Mem());
    expect(q.recordPlay(play(), at(1)).newAchievements.map((a) => a.id)).not.toContain('graduate');
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

describe('ear training', () => {
  it('counts as a game but not towards Full band, and earns Golden ears for a clean medium round', () => {
    const p = new ProgressStore(new Mem());
    const ear = (patch: Partial<PlayResult> = {}) =>
      play({
        profileId: 'ear',
        songId: 'ear-intervals-medium',
        rating: 5,
        misses: 0,
        notes: 10,
        accuracy: 1,
        ...patch,
      });
    const first = p.recordPlay(ear(), at(1));
    expect(first.newAchievements.map((a) => a.id)).toContain('golden-ears');
    expect(first.newAchievements.map((a) => a.id)).not.toContain('all-games');
    expect(p.get().perGame).toEqual({ ear: 1 });
    p.recordPlay(play({ profileId: 'voice', songId: 'a' }), at(2));
    p.recordPlay(play({ profileId: 'wind', songId: 'b' }), at(3));
    p.recordPlay(play({ profileId: 'clap', songId: 'c' }), at(4));
    const last = p.recordPlay(play({ profileId: 'ukulele-strum', songId: 'd' }), at(5));
    expect(last.newAchievements.map((a) => a.id)).toContain('all-games');
    // an easy round, or one with a mistake, is not golden
    const q = new ProgressStore(new Mem());
    expect(q.recordPlay(ear({ rating: 3 }), at(1)).newAchievements.map((a) => a.id)).not.toContain(
      'golden-ears',
    );
    expect(q.recordPlay(ear({ misses: 1 }), at(2)).newAchievements.map((a) => a.id)).not.toContain(
      'golden-ears',
    );
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

describe('practice log', () => {
  it('adds up songs and seconds per day, and reads back the recent days', () => {
    const p = new ProgressStore(new Mem());
    p.recordPlay(play({ seconds: 90 }), at(9));
    p.recordPlay(play({ seconds: 30.4 }), at(10));
    p.recordPlay(play({ seconds: 60 }), at(10));
    p.recordPlay(play(), at(10)); // no length known: counts as a song, no time
    const log = p.get().log;
    expect(log['2026-10-10']).toEqual({ plays: 3, seconds: 90 });
    const days = recentDays(log, at(11), 4);
    expect(days.map((d) => d.day)).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ]);
    expect(days.map((d) => d.seconds)).toEqual([0, 90, 90, 0]);
    expect(weekMinutes(log, at(11))).toBe(3);
    expect(weekMinutes(log, at(20))).toBe(0); // the week has moved on
  });

  it('keeps only the last 90 days and ignores junk in storage', () => {
    const mem = new Mem();
    const p = new ProgressStore(mem);
    for (let d = 0; d < 100; d++) p.recordPlay(play({ seconds: 10 }), new Date(2026, 0, 1 + d, 12));
    expect(Object.keys(p.get().log)).toHaveLength(90);
    mem.data.set(
      'lineup.progress.v1',
      '{"log": {"2026-10-01": {"plays": 2, "seconds": 70}, "bad": {"plays": 1}, "2026-10-02": 5}}',
    );
    expect(new ProgressStore(mem).get().log).toEqual({ '2026-10-01': { plays: 2, seconds: 70 } });
  });
});

/** A date in a week whose theme is `id` (searching forward from October 2026). */
function inThemeWeek(id: string, offsetDays = 0): Date {
  const d = new Date(2026, 9, 12, 12); // a Monday
  for (let i = 0; i < THEMES.length * 7 * 2; i += 7) {
    const candidate = new Date(2026, 9, 12 + i, 12);
    if (themeForWeek(candidate).id === id) {
      d.setTime(candidate.getTime());
      break;
    }
  }
  d.setDate(d.getDate() + offsetDays);
  return d;
}

describe('streaks with a rest day or a frozen day', () => {
  it('a frozen day keeps the streak alive without counting as played', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'];
    expect(streakOf(days, at(9))).toBe(2);
    expect(streakOf(days, at(9), { frozen: ['2026-10-07'] })).toBe(4);
    expect(streakOf(days, at(10), { frozen: ['2026-10-07'] })).toBe(4); // today not played yet
  });

  it('a rest day never breaks a streak, but only that weekday', () => {
    // 2026-10-04 is a Sunday
    const days = ['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06'];
    expect(streakOf(days, at(6))).toBe(2);
    expect(streakOf(days, at(6), { restDay: 0 })).toBe(4);
    expect(streakOf(days, at(6), { restDay: 3 })).toBe(2); // a Wednesday is no help
    // two missed days in a row still break it, even with a rest day
    expect(streakOf(['2026-10-02', '2026-10-06'], at(6), { restDay: 0 })).toBe(1);
  });

  it('never loops on a streak made only of bridged days', () => {
    expect(streakOf([], at(10), { frozen: ['2026-10-09', '2026-10-08'], restDay: 5 })).toBe(0);
  });
});

describe('streak freezes', () => {
  /** Plays on each given October day, in order. */
  function playDays(store: ProgressStore, days: number[]) {
    let last = null as ReturnType<ProgressStore['recordPlay']> | null;
    for (const d of days) last = store.recordPlay(play({ songId: `s${d}` }), at(d));
    return last!;
  }

  it(`earns one freeze for every ${FREEZE_EVERY} days of streak, at most ${MAX_FREEZES} banked`, () => {
    const store = new ProgressStore(new Mem());
    const sixth = playDays(store, [1, 2, 3, 4, 5, 6]);
    expect(sixth.freezeEarned).toBe(false);
    const seventh = playDays(store, [7]);
    expect(seventh.freezeEarned).toBe(true);
    expect(seventh.freezes).toBe(1);
    expect(playDays(store, [8, 9, 10, 11, 12, 13]).freezeEarned).toBe(false);
    expect(playDays(store, [14]).freezes).toBe(2);
    // a third week of streak earns nothing more while two are banked
    playDays(store, [15, 16, 17, 18, 19, 20]);
    const twentyFirst = playDays(store, [21]);
    expect(twentyFirst.freezeEarned).toBe(false);
    expect(twentyFirst.freezes).toBe(MAX_FREEZES);
  });

  it('a freeze bridges exactly one missed day, and says so', () => {
    const store = new ProgressStore(new Mem());
    playDays(store, [1, 2, 3, 4, 5, 6, 7]); // a week: one freeze banked
    expect(store.get().freezes).toBe(1);
    const back = store.recordPlay(play({ songId: 'back' }), at(9)); // missed the 8th
    expect(back.freezeUsed).toBe(true);
    expect(back.freezes).toBe(0);
    expect(back.streak).toBe(8); // the seven days and today, the 8th bridged
    expect(store.get().frozen).toEqual(['2026-10-08']);
    expect(store.streak(at(9))).toBe(8);
  });

  it('does not save a streak after two missed days, or when none is banked', () => {
    const store = new ProgressStore(new Mem());
    playDays(store, [1, 2, 3, 4, 5, 6, 7]);
    const late = store.recordPlay(play({ songId: 'late' }), at(10)); // missed the 8th and 9th
    expect(late.freezeUsed).toBe(false);
    expect(late.streak).toBe(1);
    expect(store.get().freezes).toBe(1); // still banked for next time

    const none = new ProgressStore(new Mem());
    playDays(none, [1, 2, 3]);
    expect(none.recordPlay(play({ songId: 'x' }), at(5)).freezeUsed).toBe(false);
  });

  it('a rest day needs no freeze', () => {
    const store = new ProgressStore(new Mem());
    store.setRestDay(0); // Sunday: 2026-10-04
    playDays(store, [1, 2, 3]);
    const monday = store.recordPlay(play({ songId: 'mon' }), at(5));
    expect(monday.streak).toBe(4);
    expect(store.get().restDay).toBe(0);
    store.setRestDay(9);
    expect(store.get().restDay).toBeNull();
  });

  it('a freeze covers one missed day beside the rest day', () => {
    const store = new ProgressStore(new Mem());
    store.setRestDay(0); // Sundays: the 4th and the 11th
    playDays(store, [1, 2, 3, 5, 6, 7, 8, 9, 10]);
    expect(store.get().freezes).toBe(1);
    const back = store.recordPlay(play({ songId: 'back' }), at(13)); // missed Monday the 12th
    expect(back.freezeUsed).toBe(true);
    expect(store.get().frozen).toEqual(['2026-10-12']);
    expect(store.streak(at(13))).toBeGreaterThanOrEqual(9);
  });

  it('survives a reload and ignores junk', () => {
    const mem = new Mem();
    const store = new ProgressStore(mem);
    playDays(store, [1, 2, 3, 4, 5, 6, 7]);
    store.setRestDay(2);
    const again = new ProgressStore(mem).get();
    expect(again).toMatchObject({ freezes: 1, restDay: 2, freezeAward: 7 });
    mem.setItem(
      'lineup.progress.v1',
      JSON.stringify({ freezes: 99, frozen: ['x', '2026-10-01'], restDay: 12, week: { start: 5 } }),
    );
    expect(new ProgressStore(mem).get()).toMatchObject({
      freezes: MAX_FREEZES,
      frozen: ['2026-10-01'],
      restDay: null,
      week: null,
    });
  });
});

describe('themed weeks', () => {
  it('give everyone the same theme for a whole week, and take turns', () => {
    const monday = new Date(2026, 9, 12, 9);
    const sunday = new Date(2026, 9, 18, 22);
    expect(weekStart(monday)).toBe('2026-10-12');
    expect(weekStart(sunday)).toBe('2026-10-12');
    expect(themeForWeek(monday)).toBe(themeForWeek(sunday));
    expect(weekStart(new Date(2026, 9, 19, 1))).toBe('2026-10-19');
    const seen = new Set<string>();
    for (let w = 0; w < THEMES.length; w++)
      seen.add(themeForWeek(new Date(2026, 9, 12 + 7 * w)).id);
    expect(seen.size).toBe(THEMES.length);
  });

  it('count matching songs cleared at 60%, finish at the goal, and pay a bonus once', () => {
    const store = new ProgressStore(new Mem());
    const mon = inThemeWeek('waltz');
    const waltz = (n: number, patch: Partial<PlayResult> = {}) =>
      play({ songId: `w${n}`, waltz: true, ...patch });
    const first = store.recordPlay(waltz(1), mon);
    expect(first.week).toMatchObject({
      themeId: 'waltz',
      plays: 1,
      goal: 3,
      counted: true,
      justDone: false,
    });
    // not a waltz, or not cleared: it does not count
    expect(store.recordPlay(play({ songId: 'plain' }), mon).week.counted).toBe(false);
    expect(store.recordPlay(waltz(9, { accuracy: 0.4 }), mon).week.counted).toBe(false);
    expect(store.recordPlay(waltz(2), mon).week.plays).toBe(2);
    const done = store.recordPlay(waltz(3), mon);
    expect(done.week).toMatchObject({ plays: 3, justDone: true, bonus: 100 });
    expect(store.get().weeksDone).toBe(1);
    expect(done.newAchievements.map((a) => a.id)).toContain('themed-week');
    // once finished it stays finished, with no second bonus
    const more = store.recordPlay(waltz(4), mon);
    expect(more.week).toMatchObject({ justDone: false, bonus: 0, counted: false });
    expect(store.weekProgress(mon)).toMatchObject({ themeId: 'waltz', plays: 3, done: true });
  });

  it('start afresh the next week', () => {
    const store = new ProgressStore(new Mem());
    const mon = inThemeWeek('waltz');
    store.recordPlay(play({ songId: 'w1', waltz: true }), mon);
    const next = new Date(mon);
    next.setDate(next.getDate() + 7);
    expect(store.weekProgress(next)).toMatchObject({ plays: 0, done: false });
  });

  it('can be matched by what is played: new songs, slow practice, exercises', () => {
    const store = new ProgressStore(new Mem());
    const fresh = inThemeWeek('fresh');
    expect(store.recordPlay(play({ songId: 'a' }), fresh).week.counted).toBe(true);
    expect(store.recordPlay(play({ songId: 'a' }), fresh).week.counted).toBe(false); // seen before
    const slow = inThemeWeek('slow');
    const s2 = new ProgressStore(new Mem());
    expect(s2.recordPlay(play({ speed: 0.8 }), slow).week.counted).toBe(true);
    expect(s2.recordPlay(play({ speed: 1 }), slow).week.counted).toBe(false);
    const ex = inThemeWeek('exercise');
    const s3 = new ProgressStore(new Mem());
    expect(s3.recordPlay(play({ songId: 'ex-voice-major-up-down' }), ex).week.counted).toBe(true);
    const pent = inThemeWeek('pentatonic');
    const s4 = new ProgressStore(new Mem());
    for (const id of [
      'flute-first-breath',
      'ex-wind-minor-pentatonic-up-down',
      'gen-flute-minor-pentatonic-easy-4',
    ]) {
      expect(s4.recordPlay(play({ songId: id }), pent).week.counted, id).toBe(true);
    }
    expect(s4.recordPlay(play({ songId: 'gen-chords-easy-3' }), pent).week.counted).toBe(false);
  });
});
