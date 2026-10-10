import type { ChartNote } from '../chart';
import { deviationCents } from '../notes';
import type { InputEvent } from '../types';
import type { Grade, Judge, Judgment, MissReason } from './types';

export interface DiscreteJudgeConfig {
  /** Half-width of the "perfect" window, seconds. */
  perfectWindow: number;
  /** Half-width of the "good" window, seconds. */
  goodWindow: number;
  /** Calibrated input latency, seconds. Subtracted from every input time. */
  latencyOffset: number;
  /** Credit for a "good" (a "perfect" is 1). */
  goodCredit: number;
  /** Notes must match the event's lane when both have one. */
  matchLane: boolean;
  /**
   * With matchLane: an event with no lane (a classifier that rejected the hit
   * as "unknown") does not match a laned note. Off: lane-less events match anything.
   */
  requireLane: boolean;
  /** Notes with an expected chord must match the event's recognised chord when it has one. */
  matchChord: boolean;
  /** With matchChord: an event with no recognised chord does not match a note that expects one. */
  requireChord: boolean;
  /**
   * Compare event pitch to the note's pitch, within this many cents. Events
   * without a pitch are not compared (nothing to compare). Null disables.
   */
  pitchToleranceCents: number | null;
  /** Accept the right pitch class in any octave. */
  octaveForgiving: boolean;
  /** Extra time after a window closes before declaring a miss (detector delay), seconds. */
  settle: number;
}

export const DEFAULT_DISCRETE_CONFIG: DiscreteJudgeConfig = {
  perfectWindow: 0.045,
  goodWindow: 0.11,
  latencyOffset: 0,
  goodCredit: 0.5,
  matchLane: false,
  requireLane: false,
  matchChord: false,
  requireChord: false,
  pitchToleranceCents: null,
  octaveForgiving: false,
  settle: 0.05,
};

const EPS = 1e-9;

/**
 * Onset-timing judge: each input event can hit at most one note, the nearest
 * unresolved one within the good window that also matches lane / pitch.
 */
export class DiscreteJudge implements Judge<InputEvent> {
  readonly config: DiscreteJudgeConfig;
  private readonly notes: readonly ChartNote[];
  private readonly resolved: (Judgment | undefined)[];
  private readonly nearMiss = new Map<number, MissReason>();
  private readonly pending: Judgment[] = [];
  private readonly all: Judgment[] = [];
  private firstOpen = 0;
  /** Events that matched no note (stray taps, double triggers, wrong lane). */
  strays = 0;

  constructor(notes: readonly ChartNote[], config: Partial<DiscreteJudgeConfig> = {}) {
    this.config = { ...DEFAULT_DISCRETE_CONFIG, ...config };
    this.notes = notes;
    this.resolved = new Array<Judgment | undefined>(notes.length).fill(undefined);
  }

  get judgments(): readonly Judgment[] {
    return this.all;
  }

  judgmentFor(noteIndex: number): Judgment | undefined {
    return this.resolved[noteIndex];
  }

  feed(event: InputEvent): void {
    const { goodWindow, perfectWindow, latencyOffset } = this.config;
    const t = event.time - latencyOffset;

    let best = -1;
    let bestDelta = Infinity;
    let rejected: { index: number; delta: number; reason: MissReason } | null = null;

    for (let i = this.firstOpen; i < this.notes.length; i++) {
      const note = this.notes[i]!;
      if (note.t - goodWindow > t + EPS) break; // notes are time-sorted: nothing later can match
      if (this.resolved[i]) continue;
      const delta = t - note.t;
      if (Math.abs(delta) > goodWindow + EPS) continue;
      const mismatch = this.mismatch(note, event);
      if (mismatch) {
        if (!rejected || Math.abs(delta) < Math.abs(rejected.delta))
          rejected = { index: i, delta, reason: mismatch };
        continue;
      }
      if (Math.abs(delta) < bestDelta - EPS) {
        best = i;
        bestDelta = Math.abs(delta);
      }
    }

    if (best >= 0) {
      const note = this.notes[best]!;
      const delta = t - note.t;
      const grade: Grade = Math.abs(delta) <= perfectWindow + EPS ? 'perfect' : 'good';
      const j: Judgment = {
        noteIndex: best,
        note,
        grade,
        credit: grade === 'perfect' ? 1 : this.config.goodCredit,
        timingError: delta,
        reason: null,
        resolvedAt: event.time,
      };
      const cents = this.pitchCents(note, event);
      if (cents !== null) j.pitchErrorCents = cents;
      this.settle(j);
      return;
    }

    if (rejected && !this.nearMiss.has(rejected.index))
      this.nearMiss.set(rejected.index, rejected.reason);
    this.strays++;
  }

  advance(now: number): Judgment[] {
    const limit = now - this.config.latencyOffset - this.config.goodWindow - this.config.settle;
    for (let i = this.firstOpen; i < this.notes.length; i++) {
      const note = this.notes[i]!;
      if (note.t > limit + EPS) break;
      if (!this.resolved[i]) this.settle(this.missed(i, now));
    }
    return this.drain();
  }

  finish(now = Infinity): Judgment[] {
    for (let i = this.firstOpen; i < this.notes.length; i++) {
      if (!this.resolved[i]) this.settle(this.missed(i, now));
    }
    return this.drain();
  }

  // ---- internals ----

  private mismatch(note: ChartNote, event: InputEvent): MissReason | null {
    const { matchLane, requireLane, matchChord, requireChord, pitchToleranceCents } = this.config;
    if (
      matchLane &&
      note.lane !== undefined &&
      (event.lane !== undefined || requireLane) &&
      note.lane !== event.lane
    ) {
      return 'wrong-lane';
    }
    const wanted = note.expected?.chord;
    if (
      matchChord &&
      wanted !== undefined &&
      (event.chord !== undefined || requireChord) &&
      wanted !== event.chord
    ) {
      return 'wrong-chord';
    }
    if (pitchToleranceCents !== null) {
      const cents = this.pitchCents(note, event);
      if (cents !== null && Math.abs(cents) > pitchToleranceCents) return 'wrong-pitch';
    }
    return null;
  }

  /** Signed cents of the event vs. the note, or null if either has no pitch. */
  private pitchCents(note: ChartNote, event: InputEvent): number | null {
    if (note.pitch === undefined || event.pitch === undefined || !(event.pitch > 0)) return null;
    return deviationCents(event.pitch, note.pitch, this.config.octaveForgiving);
  }

  private missed(index: number, now: number): Judgment {
    return {
      noteIndex: index,
      note: this.notes[index]!,
      grade: 'miss',
      credit: 0,
      timingError: null,
      reason: this.nearMiss.get(index) ?? 'no-input',
      resolvedAt: now,
    };
  }

  private settle(j: Judgment): void {
    this.resolved[j.noteIndex] = j;
    this.pending.push(j);
    this.all.push(j);
    while (this.firstOpen < this.notes.length && this.resolved[this.firstOpen]) this.firstOpen++;
  }

  private drain(): Judgment[] {
    return this.pending.splice(0, this.pending.length);
  }
}
