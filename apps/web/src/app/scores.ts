import type { KeyValueStore } from '@lineup/core';

/** The best result kept for one song and way of playing it. */
export interface BestScore {
  score: number;
  /** 0..1, of the highest-scoring play */
  accuracy: number;
  /** 0..1, the highest accuracy of any play of this key (a later high score may have been less accurate). */
  bestAccuracy?: number;
  /** ISO time of the latest play of this key, whether or not it set a high score. */
  lastPlayed?: string;
  /** The last few times the best improved, oldest first (the newest is the best itself). */
  history?: { score: number; accuracy: number; at: string }[];
  grade: string;
  /** ISO time it was set. */
  at: string;
}

const KEY = 'lineup.scores.v1';
/** Earlier bests kept per key, for the records timeline. */
export const MAX_HISTORY = 6;
/** Entries kept; the oldest are dropped past this so storage cannot grow without bound. */
const MAX_ENTRIES = 300;
/** Far above anything a song can score (100 points a note times a combo multiplier). */
const MAX_SCORE = 10_000_000;

/**
 * Where a result is filed. Scores are only comparable within one profile, song and "variant"
 * (the scoring difficulty, or the practice speed and chord checking), so each gets its own best.
 */
export function scoreKey(profileId: string, songId: string, variant = ''): string {
  return [profileId, songId, variant].join('|');
}

/** The later of two ISO times (either may be missing). */
const later = (a?: string, b?: string): string | undefined => (a && b ? (a > b ? a : b) : (a ?? b));

/** The earlier bests recorded, keeping only well-formed entries. */
function readHistory(raw: unknown): { score: number; accuracy: number; at: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { score: number; accuracy: number; at: string }[] = [];
  for (const h of raw) {
    if (typeof h !== 'object' || h === null) continue;
    const e = h as Record<string, unknown>;
    if (
      typeof e['score'] === 'number' &&
      e['score'] >= 0 &&
      e['score'] <= MAX_SCORE &&
      typeof e['accuracy'] === 'number' &&
      e['accuracy'] >= 0 &&
      e['accuracy'] <= 1 &&
      typeof e['at'] === 'string'
    ) {
      out.push({ score: e['score'], accuracy: e['accuracy'], at: e['at'] });
    }
  }
  return out.slice(-MAX_HISTORY);
}

function sanitize(raw: unknown): Map<string, BestScore> {
  const out = new Map<string, BestScore>();
  if (typeof raw !== 'object' || raw === null) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'object' || v === null) continue;
    const r = v as Record<string, unknown>;
    if (
      typeof r['score'] === 'number' &&
      r['score'] >= 0 &&
      r['score'] <= MAX_SCORE &&
      typeof r['accuracy'] === 'number' &&
      r['accuracy'] >= 0 &&
      r['accuracy'] <= 1 &&
      typeof r['grade'] === 'string' &&
      typeof r['at'] === 'string'
    ) {
      const bestAccuracy =
        typeof r['bestAccuracy'] === 'number' && r['bestAccuracy'] >= 0 && r['bestAccuracy'] <= 1
          ? Math.max(r['bestAccuracy'], r['accuracy'])
          : r['accuracy'];
      out.set(k, {
        score: r['score'],
        accuracy: r['accuracy'],
        bestAccuracy,
        grade: r['grade'],
        at: r['at'],
        lastPlayed: typeof r['lastPlayed'] === 'string' ? r['lastPlayed'] : r['at'],
        history: readHistory(r['history']),
      });
    }
  }
  return out;
}

/** Best scores per song, kept in a key-value store (localStorage) and tolerant of missing, blocked or corrupt storage. */
export class ScoreStore {
  /** Insertion order is age: the newest result is last. */
  private value: Map<string, BestScore>;

  constructor(private readonly store: KeyValueStore | null) {
    this.value = this.read();
  }

  /** The best result for a key, or null if it was never played. */
  best(key: string): BestScore | null {
    const b = this.value.get(key);
    return b ? { ...b } : null;
  }

  /** Every best result with its key, oldest first. */
  entries(): { key: string; best: BestScore }[] {
    this.reconcile();
    return [...this.value].map(([key, best]) => ({ key, best: { ...best } }));
  }

  /** Files a result. `isNewBest` is true when it beat the previous best, or when there was none. */
  record(
    key: string,
    result: Omit<BestScore, 'at' | 'bestAccuracy' | 'lastPlayed' | 'history'>,
    now = new Date(),
  ): { isNewBest: boolean; best: BestScore } {
    this.reconcile();
    const previous = this.best(key);
    const bestAccuracy = Math.max(
      previous?.bestAccuracy ?? 0,
      previous?.accuracy ?? 0,
      result.accuracy,
    );
    const lastPlayed = now.toISOString();
    if (previous && previous.score >= result.score) {
      // not a new high score, but a more accurate play still counts toward stars, and any play
      // counts as the latest activity
      const kept = {
        ...previous,
        bestAccuracy,
        lastPlayed: later(previous.lastPlayed, lastPlayed) ?? lastPlayed,
      };
      this.value.set(key, kept);
      this.save();
      return { isNewBest: false, best: { ...kept } };
    }
    // the best it replaces is kept, so the timeline can show how it improved
    const history = [
      ...(previous?.history ?? []),
      ...(previous
        ? [{ score: previous.score, accuracy: previous.accuracy, at: previous.at }]
        : []),
    ].slice(-MAX_HISTORY);
    const best: BestScore = {
      ...result,
      history,
      bestAccuracy,
      at: lastPlayed,
      lastPlayed: later(previous?.lastPlayed, lastPlayed) ?? lastPlayed,
    };
    this.value.delete(key); // re-insert so the newest entry is last
    this.value.set(key, best);
    for (const old of [...this.value.keys()].slice(0, Math.max(0, this.value.size - MAX_ENTRIES))) {
      this.value.delete(old);
    }
    this.save();
    return { isNewBest: true, best: { ...best } };
  }

  private save(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(Object.fromEntries(this.value)));
    } catch {
      // private window / quota: keep working in memory
    }
  }

  /**
   * Folds in what another tab saved since this one loaded, keeping the higher score per key, so
   * writing never erases a result this instance has not seen.
   */
  private reconcile(): void {
    for (const [k, stored] of this.read()) {
      const mine = this.value.get(k);
      if (!mine || stored.score > mine.score) {
        this.value.delete(k); // newest last, so an improved score is not the first to be evicted
        this.value.set(k, {
          ...stored,
          bestAccuracy: Math.max(stored.bestAccuracy ?? stored.accuracy, mine?.bestAccuracy ?? 0),
          lastPlayed: later(stored.lastPlayed, mine?.lastPlayed) ?? stored.at,
        });
      } else {
        const bestAccuracy = Math.max(stored.bestAccuracy ?? 0, mine.bestAccuracy ?? mine.accuracy);
        const lastPlayed = later(stored.lastPlayed, mine.lastPlayed);
        if (bestAccuracy > (mine.bestAccuracy ?? mine.accuracy) || lastPlayed !== mine.lastPlayed) {
          this.value.set(k, { ...mine, bestAccuracy, ...(lastPlayed ? { lastPlayed } : {}) });
        }
      }
    }
  }

  /** Forgets every score. */
  clear(): void {
    this.value = new Map();
    try {
      this.store?.removeItem(KEY);
    } catch {
      // nothing to do
    }
  }

  private read(): Map<string, BestScore> {
    try {
      const text = this.store?.getItem(KEY);
      return text ? sanitize(JSON.parse(text) as unknown) : new Map();
    } catch {
      return new Map();
    }
  }
}

/** "Best: 4,210 (A, 92%)" for the setup screen, or a prompt to set one. */
export function describeBest(best: BestScore | null): string {
  return best
    ? `Best: ${best.score.toLocaleString('en-US')} (${best.grade}, ${Math.round(best.accuracy * 100)}%)`
    : 'No score yet: be the first to set one.';
}
