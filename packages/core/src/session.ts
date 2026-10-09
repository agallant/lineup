import { chartEnd, type Chart } from './chart';
import type { SongClock } from './clock';
import type { Grade, Judge, Judgment } from './judge/types';
import { Scoreboard, type ScoreConfig, type ScoreState } from './scoring';

export type NoteStatus = Grade | 'pending';

/**
 * One play-through of a chart: ties the song clock, a judge and the scoreboard
 * together. The game loop (or the headless simulation) feeds inputs as they
 * arrive, calls `update()` once per frame, and reads state for rendering.
 * Inputs are in SONG time; use `clock.toSongTime` first.
 */
export class GameSession<I> {
  private readonly board: Scoreboard;
  private readonly status: NoteStatus[];
  private done = false;

  constructor(
    readonly chart: Chart,
    readonly judge: Judge<I>,
    readonly clock: SongClock,
    scoreConfig: Partial<ScoreConfig> = {},
  ) {
    this.board = new Scoreboard(scoreConfig);
    this.status = new Array<NoteStatus>(chart.notes.length).fill('pending');
  }

  feed(input: I): void {
    this.judge.feed(input);
  }

  /** Advances the judge to the clock's current time. Returns the judgments resolved since the last call. */
  update(): Judgment[] {
    return this.take(this.judge.advance(this.clock.now()));
  }

  /** Ends the song: resolves every remaining note. */
  finish(): Judgment[] {
    this.done = true;
    return this.take(this.judge.finish(this.clock.now()));
  }

  get finished(): boolean {
    return this.done;
  }

  get score(): ScoreState {
    return this.board.state;
  }

  /** Per-note status for renderers: 'pending' until judged. */
  get statuses(): readonly NoteStatus[] {
    return this.status;
  }

  /** Song time after which nothing more can be judged (last note's end plus a margin for in-flight input). */
  endTime(margin = 0.8): number {
    return chartEnd(this.chart) + margin;
  }

  private take(judgments: Judgment[]): Judgment[] {
    for (const j of judgments) {
      this.board.add(j);
      this.status[j.noteIndex] = j.grade;
    }
    return judgments;
  }
}
