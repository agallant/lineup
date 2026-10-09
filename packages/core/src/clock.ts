/** Anything with a monotonic seconds clock: an AudioContext, or a fake in tests. */
export interface TimeSource {
  readonly currentTime: number;
}

/**
 * Song time (seconds, 0 = first beat after the count-in, negative during the
 * count-in) derived from a TimeSource. Never from setTimeout or frame counts:
 * the renderer reads `now()` inside requestAnimationFrame, and the judge
 * works in the same domain.
 */
export class SongClock {
  private startSource: number | null = null;
  private songAtStart = 0;

  constructor(private readonly source: TimeSource) {}

  /**
   * Starts the clock. `songTimeAtStart` is the song time that corresponds to
   * `sourceTime`; pass a future `sourceTime` to align with audio scheduled
   * with AudioContext's start(when).
   */
  start(songTimeAtStart = 0, sourceTime: number = this.source.currentTime): void {
    this.songAtStart = songTimeAtStart;
    this.startSource = sourceTime;
  }

  stop(): void {
    this.startSource = null;
  }

  get running(): boolean {
    return this.startSource !== null;
  }

  /** Current song time. Before start() it is the song time the clock will start at. */
  now(): number {
    return this.toSongTime(this.source.currentTime);
  }

  toSongTime(sourceTime: number): number {
    if (this.startSource === null) return this.songAtStart;
    return this.songAtStart + (sourceTime - this.startSource);
  }

  toSourceTime(songTime: number): number {
    if (this.startSource === null) throw new Error('SongClock is not running');
    return this.startSource + (songTime - this.songAtStart);
  }
}
