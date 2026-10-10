import type { ChartNote } from '../chart';

export type Grade = 'perfect' | 'good' | 'miss';

/** Why a note was missed, when we know. */
export type MissReason =
  /** Nothing was heard near it. */
  | 'no-input'
  /** Something was heard on time but in the wrong lane. */
  | 'wrong-lane'
  /** Something was heard on time but at the wrong pitch. */
  | 'wrong-pitch'
  /** Something was heard on time but it was a different chord. */
  | 'wrong-chord';

export interface Judgment {
  noteIndex: number;
  note: ChartNote;
  grade: Grade;
  /** Fraction of full points earned, 0..1. */
  credit: number;
  /** Signed seconds after the note's time (negative = early), latency-corrected. Null if nothing matched. */
  timingError: number | null;
  /** Only for misses. */
  reason: MissReason | null;
  /** Signed cents from the target when pitch was compared. */
  pitchErrorCents?: number;
  /** Fraction of the sustain that was on pitch (continuous judge). */
  coverage?: number;
  /** Song time (raw clock) when this judgment was issued. */
  resolvedAt: number;
}

/**
 * Judges are pure state machines. All times are SONG TIME seconds (convert
 * AudioContext times with SongClock first). The judge applies the calibrated
 * latency offset itself.
 *
 * Game loop: feed(inputs as they arrive); each frame call advance(clock.now())
 * and pass the returned judgments to the scoreboard and renderer.
 */
export interface Judge<I> {
  feed(input: I): void;
  /** Newly resolved judgments since the previous call, in resolution order. */
  advance(now: number): Judgment[];
  /** Resolve everything still pending (end of song). */
  finish(now?: number): Judgment[];
  readonly judgments: readonly Judgment[];
  judgmentFor(noteIndex: number): Judgment | undefined;
}
