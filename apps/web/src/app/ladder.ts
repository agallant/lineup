import type { KeyValueStore } from '@lineup/core';

/** The practice speeds a tempo ladder climbs, slowest first; the top rung is the real tempo. */
export const LADDER_RUNGS: readonly number[] = [0.65, 0.8, 1];

/** Accuracy a run needs to clear its rung. */
export const LADDER_ACCURACY = 0.9;

const KEY = 'lineup.ladder.v1';
/** Songs kept; the oldest are dropped past this so storage cannot grow without bound. */
const MAX_SONGS = 200;

/** What a finished run did to a song's ladder. */
export interface LadderStep {
  /** The rungs cleared so far, slowest first. */
  cleared: number[];
  /** This run cleared a rung it had not cleared before. */
  newRung: boolean;
  /** The next rung to try, or null when the ladder is climbed. */
  next: number | null;
  /** Every rung is cleared. */
  complete: boolean;
  /** This run cleared the last rung. */
  justCompleted: boolean;
}

/** The rung a play speed counts for, or null when it is not on the ladder (or below the lowest). */
export function rungFor(speed: number): number | null {
  let found: number | null = null;
  for (const r of LADDER_RUNGS) if (speed >= r - 1e-9) found = r;
  return found;
}

const isRung = (v: unknown): v is number => typeof v === 'number' && LADDER_RUNGS.includes(v);

/**
 * Tempo ladders: a song is learnt slow first, then faster, to the real tempo. A clean run at a rung
 * (the speed or above, never below it) clears that rung; clearing them all climbs the ladder.
 * Kept per song and profile in local storage.
 */
export class LadderStore {
  private value: Record<string, number[]>;

  constructor(private readonly store: KeyValueStore | null) {
    this.value = this.read();
  }

  /** Rungs cleared on a song (`<profile>|<song>`), slowest first. */
  cleared(songKey: string): number[] {
    return [...(this.value[songKey] ?? [])];
  }

  /** The state of a ladder without a new run. */
  status(songKey: string): LadderStep {
    return this.step(songKey, false, false);
  }

  /** Files a finished run at a play speed. */
  record(songKey: string, speed: number, accuracy: number): LadderStep {
    this.value = this.read();
    const rung = accuracy >= LADDER_ACCURACY ? rungFor(speed) : null;
    const before = this.value[songKey] ?? [];
    if (rung === null || before.includes(rung)) return this.step(songKey, false, false);
    const was = before.length === LADDER_RUNGS.length;
    const after = LADDER_RUNGS.filter((r) => r === rung || before.includes(r));
    // move the song to the end so the ones played least recently are the ones dropped
    const others = Object.entries(this.value).filter(([k]) => k !== songKey);
    this.value = Object.fromEntries([...others, [songKey, after]].slice(-MAX_SONGS));
    this.write();
    return this.step(songKey, true, !was && after.length === LADDER_RUNGS.length);
  }

  private step(songKey: string, newRung: boolean, justCompleted: boolean): LadderStep {
    const cleared = this.cleared(songKey);
    const next = LADDER_RUNGS.find((r) => !cleared.includes(r)) ?? null;
    return { cleared, newRung, next, complete: next === null, justCompleted };
  }

  private read(): Record<string, number[]> {
    try {
      const raw = JSON.parse(this.store?.getItem(KEY) ?? '{}') as unknown;
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
      const out: Record<string, number[]> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          const rungs = LADDER_RUNGS.filter((r) => (v as unknown[]).filter(isRung).includes(r));
          if (rungs.length > 0) out[k] = rungs;
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  private write(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // storage full or blocked: the ladder is a nicety
    }
  }
}

/** The ladder as text for the results: "65% ✓ · 80% ✓ · 100%". */
export function ladderText(cleared: readonly number[]): string {
  return LADDER_RUNGS.map((r) => `${Math.round(r * 100)}%${cleared.includes(r) ? ' ✓' : ''}`).join(
    ' · ',
  );
}
