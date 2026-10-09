import type { TrailPoint } from './renderer';

/** A short rolling history of the player's pitch, in song time. */
export class PitchTrail {
  private points: TrailPoint[] = [];

  /** @param keepSeconds how much history to keep behind the newest point. */
  constructor(private readonly keepSeconds = 4) {}

  push(point: TrailPoint): void {
    this.points.push(point);
    const cutoff = point.time - this.keepSeconds;
    let drop = 0;
    while (drop < this.points.length && this.points[drop]!.time < cutoff) drop++;
    if (drop > 0) this.points = this.points.slice(drop);
  }

  get snapshot(): readonly TrailPoint[] {
    return this.points;
  }

  clear(): void {
    this.points = [];
  }
}

/**
 * The octave of `midi` nearest to `reference`, for display: an octave-forgiving
 * singer's trail should sit next to the target even when they sing an octave
 * away (or the tracker reads one).
 */
export function foldMidiNear(midi: number, reference: number): number {
  return midi - 12 * Math.round((midi - reference) / 12);
}
