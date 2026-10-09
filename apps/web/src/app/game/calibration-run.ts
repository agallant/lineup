import { detectClickBleed, estimateOffset, type OffsetEstimate } from '@lineup/core';

export interface CalibrationPlan {
  /** Click times on the audio clock, seconds. */
  clicks: number[];
  /** The first `quiet` clicks are for listening: the player stays silent. */
  quiet: number;
}

/** Clicks every `interval` seconds starting at `startAt`: `quiet` silent ones, then `play` to respond to. */
export function planCalibration(
  startAt: number,
  {
    quiet = 3,
    play = 12,
    interval = 0.5,
  }: { quiet?: number; play?: number; interval?: number } = {},
): CalibrationPlan {
  return { clicks: Array.from({ length: quiet + play }, (_, i) => startAt + i * interval), quiet };
}

export type CalibrationOutcome =
  | { kind: 'ok'; estimate: OffsetEstimate }
  /** The mic heard the click track itself while the player was silent. */
  | { kind: 'bleed' }
  | { kind: 'failed'; reason: string };

/**
 * Decides what a calibration run measured. `onsets` are every onset heard on
 * the audio clock during the run. During the quiet clicks the player is silent,
 * so onsets right on them mean the speaker is leaking into the mic.
 */
export function analyzeCalibration(
  plan: CalibrationPlan,
  onsets: readonly number[],
  /** The latency the browser reports (see `defaultOffsetFromLatencies`). Keeps a slow output (Bluetooth) from being paired with the next click. */
  prior = 0,
): CalibrationOutcome {
  const quietClicks = plan.clicks.slice(0, plan.quiet);
  const playClicks = plan.clicks.slice(plan.quiet);
  const quietEnd = playClicks[0] ?? Infinity;
  if (
    detectClickBleed(
      quietClicks,
      onsets.filter((o) => o < quietEnd - 0.1),
    )
  )
    return { kind: 'bleed' };
  const estimate = estimateOffset(
    playClicks,
    onsets.filter((o) => o >= quietEnd - 0.2),
    { prior },
  );
  return estimate.ok ? { kind: 'ok', estimate } : { kind: 'failed', reason: estimate.reason };
}
