import type { KeyValueStore } from '@lineup/core';
import { WEEKLY_BONUS, themeForWeek, weekStart } from './themes';

/** What one finished song tells the progress tracker. */
export interface PlayResult {
  profileId: string;
  songId: string;
  /** 0..1 */
  accuracy: number;
  /** The song's difficulty, 1 to 10. */
  rating: number;
  /** True when the song has sharps or flats outside its key. */
  chromatic: boolean;
  /** Notes missed, and in all. */
  misses: number;
  notes: number;
  /** How long the song took, in seconds (its last note's end). */
  seconds?: number;
  /** Today's daily challenge for the game, played as given. */
  daily?: { key: string };
  /** The song is in three-four time. */
  waltz?: boolean;
  /** The practice speed it was played at (1 is as written). */
  speed?: number;
}

/** Everything kept about a player's progress, all in this device's storage. */
export interface ProgressState {
  xp: number;
  plays: number;
  /** Days played (local dates, "2026-10-11"), oldest first, the last 400 kept. */
  days: string[];
  /** Plays per game family (see {@link gameOf}). */
  perGame: Record<string, number>;
  /** Distinct songs played, as "profile|song". */
  songs: string[];
  /** Practice per day (local date): songs finished and seconds played; the last 90 days kept. */
  log: Record<string, { plays: number; seconds: number }>;
  /** Daily challenges cleared, as "day|game", the last 120 kept. */
  dailies: string[];
  /** When each achievement was earned (ISO time). */
  achievements: Record<string, string>;
  /** Streak freezes banked (at most {@link MAX_FREEZES}); one bridges a single missed day. */
  freezes: number;
  /** Days a freeze was spent on (local dates): they keep a streak alive without counting as played. */
  frozen: string[];
  /** The streak length a freeze was last earned at, so one streak earns one per week of it. */
  freezeAward: number;
  /** A weekday (0 Sunday to 6 Saturday) that never breaks a streak, or null. */
  restDay: number | null;
  /** The current themed week: its Monday, the songs that counted and whether it is done. */
  week: { start: string; plays: number; done: boolean } | null;
  /** Themed weeks finished, ever. */
  weeksDone: number;
}

const KEY = 'lineup.progress.v1';
const MAX_DAYS = 400;
const MAX_SONGS = 2000;
const MAX_DAILIES = 120;
const MAX_LOG_DAYS = 90;
/** Streak freezes that can be banked at once. */
export const MAX_FREEZES = 2;
/** A freeze is earned each time a streak reaches a multiple of this many days. */
export const FREEZE_EVERY = 7;
/** XP for clearing a daily challenge (60% accuracy or better), once per game per day. */
export const DAILY_BONUS = 50;

export const emptyProgress = (): ProgressState => ({
  xp: 0,
  plays: 0,
  days: [],
  perGame: {},
  songs: [],
  log: {},
  dailies: [],
  achievements: {},
  freezes: 0,
  frozen: [],
  freezeAward: 0,
  restDay: null,
  week: null,
  weeksDone: 0,
});

/** The games (four for an instrument, and ear training), by the profile ids that belong to each. */
export const GAMES = [
  { id: 'singline', label: 'Singline', profiles: ['voice'] },
  { id: 'windline', label: 'Windline', profiles: ['wind'] },
  { id: 'beatline', label: 'Beatline', profiles: ['clap', 'hand-percussion', 'drum-kit'] },
  { id: 'strumline', label: 'Strumline', profiles: ['ukulele-strum'] },
  { id: 'ear', label: 'Ear training', profiles: ['ear'] },
] as const;

/** The game a profile belongs to, or null for a profile this version does not know. */
export const gameOf = (profileId: string): (typeof GAMES)[number] | null =>
  GAMES.find((g) => (g.profiles as readonly string[]).includes(profileId)) ?? null;

/** Stars for a result: 1 from 60% accuracy, 2 from 80%, 3 from 95%. */
export const starsFor = (accuracy: number): 0 | 1 | 2 | 3 =>
  accuracy >= 0.95 ? 3 : accuracy >= 0.8 ? 2 : accuracy >= 0.6 ? 1 : 0;

/** "★★☆" for a star count out of three. */
export const starText = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(3 - stars);

const TITLES = [
  'Listener',
  'Busker',
  'Student',
  'Player',
  'Regular',
  'Performer',
  'Soloist',
  'Maestro',
  'Virtuoso',
  'Legend',
];

export interface LevelInfo {
  level: number;
  title: string;
  /** XP earned since this level began, and the XP the next one needs from there. */
  into: number;
  span: number;
}

/** XP at which a level begins: level 2 at 100, 3 at 300, 4 at 600, 5 at 1000... */
const startOf = (level: number): number => 50 * level * (level - 1);

/** The level for an amount of XP. */
export function levelFor(xp: number): LevelInfo {
  let level = 1;
  while (xp >= startOf(level + 1)) level++;
  return {
    level,
    title: TITLES[Math.min(level, TITLES.length) - 1]!,
    into: xp - startOf(level),
    span: startOf(level + 1) - startOf(level),
  };
}

/** XP for a result: accuracy scaled up by difficulty, with bonuses for a clean run. */
export function xpFor(r: PlayResult): number {
  const base = r.accuracy * 60 * (1 + r.rating / 5);
  const bonus = (r.accuracy >= 0.95 ? 25 : 0) + (r.misses === 0 && r.notes >= 8 ? 25 : 0);
  return Math.min(600, Math.max(0, Math.round(base + bonus)));
}

/** A local date as "2026-10-11". */
export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What keeps a streak alive without a song: freezes already spent, and a weekly rest day. */
export interface StreakRules {
  frozen?: readonly string[];
  restDay?: number | null;
}

/**
 * Days in a row played, up to and including `today` (or ending yesterday, which still counts so a
 * streak is not lost before you have played today). A day that was frozen, or is the rest day,
 * does not break the streak but does not add to it either.
 */
export function streakOf(days: readonly string[], today: Date, rules: StreakRules = {}): number {
  const played = new Set(days);
  const bridged = new Set(rules.frozen ?? []);
  const rest = rules.restDay ?? null;
  const bridges = (d: Date): boolean =>
    bridged.has(dayKey(d)) || (rest !== null && d.getDay() === rest);
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // today is not over yet: if it is not played, the streak runs to yesterday
  if (!played.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  // a long run of bridged days can never be a streak by itself: stop after a week of them
  let gap = 0;
  while (gap < 7) {
    if (played.has(dayKey(cursor))) {
      streak++;
      gap = 0;
    } else if (bridges(cursor)) {
      gap++;
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
  }
  return gap >= 7 ? 0 : streak;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  /** Whether the achievement is earned, given the state after this play and the play itself. */
  earned(state: ProgressState, play: PlayResult, streak: number): boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-song',
    title: 'First notes',
    description: 'Finish a song.',
    earned: (s) => s.plays >= 1,
  },
  {
    id: 'ten-songs',
    title: 'Repertoire',
    description: 'Play 10 different songs.',
    earned: (s) => s.songs.length >= 10,
  },
  {
    id: 'fifty-plays',
    title: 'Practice makes progress',
    description: 'Finish 50 songs.',
    earned: (s) => s.plays >= 50,
  },
  {
    id: 'three-stars',
    title: 'Three stars',
    description: 'Play a song with 95% accuracy or better.',
    earned: (_s, p) => starsFor(p.accuracy) === 3,
  },
  {
    id: 'flawless',
    title: 'Flawless',
    description: 'Play a song of 8 notes or more without missing one.',
    earned: (_s, p) => p.misses === 0 && p.notes >= 8,
  },
  {
    id: 'tough',
    title: 'Tough one',
    description: 'Clear a song rated 7 or higher with 80% accuracy.',
    earned: (_s, p) => p.rating >= 7 && p.accuracy >= 0.8,
  },
  {
    id: 'chromatic',
    title: 'Sharps and flats',
    description: 'Clear a chromatic song with 80% accuracy.',
    earned: (_s, p) => p.chromatic && p.accuracy >= 0.8,
  },
  {
    id: 'all-games',
    title: 'Full band',
    description: 'Play all four instrument games.',
    earned: (s) => GAMES.filter((g) => g.id !== 'ear').every((g) => (s.perGame[g.id] ?? 0) > 0),
  },
  {
    id: 'streak-3',
    title: 'Three days running',
    description: 'Play on 3 days in a row.',
    earned: (_s, _p, streak) => streak >= 3,
  },
  {
    id: 'streak-7',
    title: 'A week of music',
    description: 'Play on 7 days in a row.',
    earned: (_s, _p, streak) => streak >= 7,
  },
  {
    id: 'golden-ears',
    title: 'Golden ears',
    description: 'Answer every question right in a medium or hard ear-training round.',
    earned: (_s, p) => p.profileId === 'ear' && p.misses === 0 && p.rating >= 5,
  },
  {
    id: 'daily-first',
    title: 'Challenge accepted',
    description: 'Clear a daily challenge.',
    earned: (s) => s.dailies.length >= 1,
  },
  {
    id: 'daily-seven',
    title: 'Dedicated',
    description: 'Clear 7 daily challenges.',
    earned: (s) => s.dailies.length >= 7,
  },
  {
    id: 'graduate',
    title: 'Graduate',
    description: 'Master every step of a learning path.',
    // granted when a play finishes a learning path (see completedCourse) (see ProgressStore.grant)
    earned: () => false,
  },
  {
    id: 'themed-week',
    title: 'Theme of the week',
    description: 'Finish a themed week.',
    earned: (s) => s.weeksDone >= 1,
  },
  {
    id: 'themed-four',
    title: 'Every week a new thing',
    description: 'Finish four themed weeks.',
    earned: (s) => s.weeksDone >= 4,
  },
  {
    id: 'collector',
    title: 'Collector',
    description: 'Earn a bronze badge on the collection page.',
    // granted when a play earns it (see ProgressStore.grant and collectionBadges)
    earned: () => false,
  },
  {
    id: 'curator',
    title: 'Curator',
    description: 'Earn a gold badge on the collection page.',
    earned: () => false,
  },
  {
    id: 'level-5',
    title: 'Regular',
    description: 'Reach level 5.',
    earned: (s) => levelFor(s.xp).level >= 5,
  },
];

export interface PlayOutcome {
  xpGained: number;
  level: LevelInfo;
  leveledUp: boolean;
  streak: number;
  /** XP from clearing a daily challenge, included in `xpGained`; 0 when none. */
  dailyBonus: number;
  /** Achievements earned by this play. */
  newAchievements: Achievement[];
  /** A streak freeze was spent to keep the streak alive over a missed day. */
  freezeUsed: boolean;
  /** A streak freeze was earned by this play. */
  freezeEarned: boolean;
  /** Streak freezes banked after this play. */
  freezes: number;
  /** The themed week after this play: the songs that have counted, and whether this one did or finished it. */
  week: {
    themeId: string;
    plays: number;
    goal: number;
    counted: boolean;
    justDone: boolean;
    bonus: number;
  };
}

function sanitize(raw: unknown): ProgressState {
  const out = emptyProgress();
  if (typeof raw !== 'object' || raw === null) return out;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0;
  out.xp = Math.floor(num(r['xp'], 1e9));
  out.plays = Math.floor(num(r['plays'], 1e7));
  if (Array.isArray(r['days'])) {
    out.days = r['days']
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(-MAX_DAYS);
  }
  if (typeof r['log'] === 'object' && r['log'] !== null) {
    const days = Object.entries(r['log'] as Record<string, unknown>)
      .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-MAX_LOG_DAYS);
    for (const [d, v] of days) {
      if (typeof v !== 'object' || v === null) continue;
      const e = v as Record<string, unknown>;
      out.log[d] = {
        plays: Math.floor(num(e['plays'], 1e5)),
        seconds: Math.floor(num(e['seconds'], 1e7)),
      };
    }
  }
  if (Array.isArray(r['dailies'])) {
    out.dailies = r['dailies']
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}\|[a-z]+$/.test(d))
      .slice(-MAX_DAILIES);
  }
  if (Array.isArray(r['songs'])) {
    out.songs = r['songs'].filter((s): s is string => typeof s === 'string').slice(-MAX_SONGS);
  }
  if (typeof r['perGame'] === 'object' && r['perGame'] !== null) {
    for (const g of GAMES) {
      const n = Math.floor(num((r['perGame'] as Record<string, unknown>)[g.id], 1e7));
      if (n > 0) out.perGame[g.id] = n;
    }
  }
  out.freezes = Math.min(MAX_FREEZES, Math.floor(num(r['freezes'], MAX_FREEZES)));
  out.freezeAward = Math.floor(num(r['freezeAward'], 1e5));
  if (Array.isArray(r['frozen'])) {
    out.frozen = r['frozen']
      .filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(-MAX_DAYS);
  }
  out.restDay =
    typeof r['restDay'] === 'number' &&
    Number.isInteger(r['restDay']) &&
    r['restDay'] >= 0 &&
    r['restDay'] <= 6
      ? r['restDay']
      : null;
  const week = r['week'];
  if (typeof week === 'object' && week !== null) {
    const w = week as Record<string, unknown>;
    if (typeof w['start'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w['start'])) {
      out.week = {
        start: w['start'],
        plays: Math.floor(num(w['plays'], 1e4)),
        done: w['done'] === true,
      };
    }
  }
  out.weeksDone = Math.floor(num(r['weeksDone'], 1e5));
  if (typeof r['achievements'] === 'object' && r['achievements'] !== null) {
    for (const a of ACHIEVEMENTS) {
      const at = (r['achievements'] as Record<string, unknown>)[a.id];
      if (typeof at === 'string') out.achievements[a.id] = at;
    }
  }
  return out;
}

/** Progress kept in a key-value store (localStorage); tolerant of missing, blocked or corrupt storage. */
export class ProgressStore {
  private value: ProgressState;

  constructor(private readonly store: KeyValueStore | null) {
    this.value = this.read();
  }

  /** A copy of the current state. */
  get(): ProgressState {
    return structuredClone(this.value);
  }

  /** Days in a row played as of `now`. */
  streak(now = new Date()): number {
    return streakOf(this.value.days, now, this.value);
  }

  /** Sets the weekday (0 Sunday to 6 Saturday) that never breaks a streak, or none. */
  setRestDay(day: number | null): void {
    if (this.store) this.value = this.read();
    this.value.restDay = day !== null && Number.isInteger(day) && day >= 0 && day <= 6 ? day : null;
    this.write();
  }

  /** The themed week as of `now`: the theme's progress, starting afresh in a new week. */
  weekProgress(now = new Date()): { themeId: string; plays: number; done: boolean } {
    const theme = themeForWeek(now);
    const w = this.value.week;
    return w && w.start === weekStart(now)
      ? { themeId: theme.id, plays: w.plays, done: w.done }
      : { themeId: theme.id, plays: 0, done: false };
  }

  /** Files a finished song: adds XP, the day, the song and any achievements it earns. */
  recordPlay(result: PlayResult, now = new Date()): PlayOutcome {
    // pick up what another tab saved since this one loaded, so writing never erases it
    if (this.store) this.value = this.read();
    const before = levelFor(this.value.xp).level;
    const v = this.value;
    const gained = xpFor(result);
    const today = dayKey(now);
    // a first song of the day is worth a little extra, so coming back is rewarded
    const dayBonus = v.days.includes(today) ? 0 : 20;
    const song = `${result.profileId}|${result.songId}`;
    const isNew = !v.songs.includes(song);
    // a day was missed between the last day played and today: spend a freeze to bridge it
    let freezeUsed = false;
    if (!v.days.includes(today) && v.freezes > 0) {
      const last = v.days.at(-1);
      if (last !== undefined) {
        // the days between the last one played and today that nothing covers yet
        const uncovered: string[] = [];
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
        d.setDate(d.getDate() - 1);
        for (let i = 0; i < 8 && dayKey(d) > last; i++, d.setDate(d.getDate() - 1)) {
          if (!v.frozen.includes(dayKey(d)) && d.getDay() !== v.restDay) uncovered.push(dayKey(d));
        }
        const missedKey = uncovered[0];
        // exactly one day missed, which a rest day or an earlier freeze does not already cover
        if (
          uncovered.length === 1 &&
          missedKey !== undefined &&
          streakOf(v.days, new Date(`${last}T12:00:00`), v) >= 2
        ) {
          v.freezes--;
          v.frozen = [...v.frozen, missedKey].slice(-MAX_DAYS);
          freezeUsed = true;
        }
      }
    }
    const cleared = result.daily && result.accuracy >= 0.6 && !v.dailies.includes(result.daily.key);
    const dailyBonus = cleared ? DAILY_BONUS : 0;
    if (cleared) v.dailies = [...v.dailies, result.daily!.key].slice(-MAX_DAILIES);
    v.xp += gained + dayBonus + dailyBonus;
    v.plays++;
    const entry = v.log[today] ?? { plays: 0, seconds: 0 };
    v.log[today] = {
      plays: entry.plays + 1,
      seconds: entry.seconds + Math.round(Math.max(0, result.seconds ?? 0)),
    };
    v.log = Object.fromEntries(
      Object.entries(v.log)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-MAX_LOG_DAYS),
    );
    if (!v.days.includes(today)) v.days = [...v.days, today].slice(-MAX_DAYS);
    const game = gameOf(result.profileId);
    if (game) v.perGame[game.id] = (v.perGame[game.id] ?? 0) + 1;
    if (isNew) v.songs = [...v.songs, song].slice(-MAX_SONGS);
    const streak = streakOf(v.days, now, v);
    // one freeze for every week of an unbroken streak, up to a couple banked
    if (streak < v.freezeAward) v.freezeAward = 0;
    let freezeEarned = false;
    if (streak >= FREEZE_EVERY && streak % FREEZE_EVERY === 0 && streak > v.freezeAward) {
      v.freezeAward = streak;
      if (v.freezes < MAX_FREEZES) {
        v.freezes++;
        freezeEarned = true;
      }
    }
    // the themed week: a song that matches and was cleared counts toward its goal
    const theme = themeForWeek(now);
    if (v.week?.start !== weekStart(now)) v.week = { start: weekStart(now), plays: 0, done: false };
    let justDone = false;
    let counted = false;
    let weeklyBonus = 0;
    if (!v.week.done && result.accuracy >= 0.6 && theme.matches(result, isNew)) {
      counted = true;
      v.week.plays++;
      if (v.week.plays >= theme.goal) {
        v.week.done = true;
        v.weeksDone++;
        justDone = true;
        weeklyBonus = WEEKLY_BONUS;
        v.xp += weeklyBonus;
      }
    }
    const newAchievements = ACHIEVEMENTS.filter(
      (a) => !v.achievements[a.id] && a.earned(v, result, streak),
    );
    for (const a of newAchievements) v.achievements[a.id] = now.toISOString();
    this.write();
    const level = levelFor(v.xp);
    return {
      xpGained: gained + dayBonus + dailyBonus + weeklyBonus,
      dailyBonus,
      level,
      leveledUp: level.level > before,
      streak,
      newAchievements,
      freezeUsed,
      freezeEarned,
      freezes: v.freezes,
      week: {
        themeId: theme.id,
        plays: v.week.plays,
        goal: theme.goal,
        counted,
        justDone,
        bonus: weeklyBonus,
      },
    };
  }

  /**
   * Awards an achievement that is decided somewhere other than a finished song (such as finishing a
   * learning path). Returns it if it was not already earned, else null.
   */
  grant(id: string, now = new Date()): Achievement | null {
    if (this.store) this.value = this.read();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a || this.value.achievements[id]) return null;
    this.value.achievements[id] = now.toISOString();
    this.write();
    return a;
  }

  /** Progress as JSON text, for a private backup file. */
  exportJson(): string {
    return JSON.stringify({ lineup: 'progress', version: 1, ...this.value }, null, 2);
  }

  /** Replaces progress with a backup made by {@link exportJson}; false (nothing changed) if it is not one. */
  importJson(text: string): boolean {
    try {
      const raw = JSON.parse(text) as unknown;
      if (
        typeof raw !== 'object' ||
        raw === null ||
        (raw as Record<string, unknown>)['lineup'] !== 'progress'
      ) {
        return false;
      }
      this.value = sanitize(raw);
      this.write();
      return true;
    } catch {
      return false;
    }
  }

  /** Forgets all progress. */
  clear(): void {
    this.value = emptyProgress();
    try {
      this.store?.removeItem(KEY);
    } catch {
      // nothing to do
    }
  }

  private write(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // private window / quota: keep working in memory
    }
  }

  private read(): ProgressState {
    try {
      const text = this.store?.getItem(KEY);
      return text ? sanitize(JSON.parse(text) as unknown) : emptyProgress();
    } catch {
      return emptyProgress();
    }
  }
}

/** Practice for one day. */
export interface DayPractice {
  day: string;
  plays: number;
  seconds: number;
}

/** The last `n` days up to and including `today`, oldest first, with zeros for days not played. */
export function recentDays(
  log: Readonly<Record<string, { plays: number; seconds: number }>>,
  today: Date,
  n: number,
): DayPractice[] {
  const out: DayPractice[] = [];
  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  cursor.setDate(cursor.getDate() - (n - 1));
  for (let i = 0; i < n; i++) {
    const day = dayKey(cursor);
    out.push({ day, plays: log[day]?.plays ?? 0, seconds: log[day]?.seconds ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Minutes practised over the last seven days (including today), rounded down. */
export const weekMinutes = (
  log: Readonly<Record<string, { plays: number; seconds: number }>>,
  today: Date,
): number => Math.floor(recentDays(log, today, 7).reduce((a, d) => a + d.seconds, 0) / 60);
