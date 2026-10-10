import type { KeyValueStore } from '@lineup/core';

/** The best result kept for one song and way of playing it. */
export interface BestScore {
  score: number;
  /** 0..1 */
  accuracy: number;
  grade: string;
  /** ISO time it was set. */
  at: string;
}

const KEY = 'lineup.scores.v1';
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
      out.set(k, { score: r['score'], accuracy: r['accuracy'], grade: r['grade'], at: r['at'] });
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

  /** Files a result. `isNewBest` is true when it beat the previous best, or when there was none. */
  record(
    key: string,
    result: Omit<BestScore, 'at'>,
    now = new Date(),
  ): { isNewBest: boolean; best: BestScore } {
    this.reconcile();
    const previous = this.best(key);
    if (previous && previous.score >= result.score) return { isNewBest: false, best: previous };
    const best: BestScore = { ...result, at: now.toISOString() };
    this.value.delete(key); // re-insert so the newest entry is last
    this.value.set(key, best);
    for (const old of [...this.value.keys()].slice(0, Math.max(0, this.value.size - MAX_ENTRIES))) {
      this.value.delete(old);
    }
    try {
      this.store?.setItem(KEY, JSON.stringify(Object.fromEntries(this.value)));
    } catch {
      // private window / quota: keep working in memory
    }
    return { isNewBest: true, best: { ...best } };
  }

  /**
   * Folds in what another tab saved since this one loaded, keeping the higher score per key, so
   * writing never erases a result this instance has not seen.
   */
  private reconcile(): void {
    for (const [k, stored] of this.read()) {
      const mine = this.value.get(k);
      if (!mine || stored.score > mine.score) this.value.set(k, stored);
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
