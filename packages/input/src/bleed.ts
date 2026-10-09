import type { PitchFrame } from '@lineup/core';

export interface BleedResult {
  /** Fraction of frames in which the test tone was heard, 0..1. */
  fraction: number;
  /** Mean level (dBFS) of those frames, or null if the tone was never heard. */
  meanLevelDb: number | null;
  /** True when enough of the tone leaks into the mic that it would register as singing. */
  bleeding: boolean;
}

export interface BleedOptions {
  /** How close (cents) a frame must be to the tone to count. */
  toleranceCents?: number;
  /** Fraction of frames that must hear the tone to call it bleed. */
  threshold?: number;
}

/**
 * Speaker-to-mic leakage check. The app plays a test tone while the player is
 * silent; `frames` are the pitch frames received during that tone. If the
 * ordinary voice pipeline (same level and clarity gates the game uses) hears
 * the tone, so would it hear the backing track, and a silent player could
 * score. Use headphones.
 */
export function detectBleed(
  frames: readonly PitchFrame[],
  toneHz: number,
  { toleranceCents = 50, threshold = 0.3 }: BleedOptions = {},
): BleedResult {
  if (frames.length === 0) return { fraction: 0, meanLevelDb: null, bleeding: false };
  let heard = 0;
  let levelSum = 0;
  for (const f of frames) {
    if (f.frequency === null) continue;
    // Octave-folded, like the voice judge: the tracker may read the tone an octave off.
    let cents = 1200 * Math.log2(f.frequency / toneHz);
    cents -= 1200 * Math.round(cents / 1200);
    if (Math.abs(cents) <= toleranceCents) {
      heard++;
      levelSum += f.level;
    }
  }
  const fraction = heard / frames.length;
  return {
    fraction,
    meanLevelDb: heard ? levelSum / heard : null,
    bleeding: fraction >= threshold,
  };
}

export interface ClickBleedResult {
  /** Fraction of the played clicks that were followed by a detected onset, 0..1. */
  fraction: number;
  /** Onsets heard that did not follow any click (room noise, a restless player). */
  unrelated: number;
  /** True when the clicks leak into the mic enough to register as hits. */
  bleeding: boolean;
}

export interface ClickBleedOptions {
  /** An onset this soon after a click (seconds) counts as that click leaking. */
  window?: number;
  /** Fraction of clicks that must be heard to call it bleed. */
  threshold?: number;
}

/**
 * Percussion version of the speaker-to-mic check: the app plays a few clicks
 * (or the count-in) while the player stays silent. `onsetTimes` are the
 * onsets the ordinary percussion detector reported, `clickTimes` when the
 * clicks sounded, both on the AudioContext clock and including output
 * latency in `clickTimes` (pass the audible time). If the detector hears the
 * clicks, a silent player could score off the backing track: use headphones.
 */
export function detectClickBleed(
  onsetTimes: readonly number[],
  clickTimes: readonly number[],
  { window = 0.12, threshold = 0.5 }: ClickBleedOptions = {},
): ClickBleedResult {
  if (clickTimes.length === 0)
    return { fraction: 0, unrelated: onsetTimes.length, bleeding: false };
  const used = new Set<number>();
  let heard = 0;
  for (const c of clickTimes) {
    const i = onsetTimes.findIndex((t, k) => !used.has(k) && t >= c - 0.02 && t <= c + window);
    if (i >= 0) {
      used.add(i);
      heard++;
    }
  }
  const fraction = heard / clickTimes.length;
  return { fraction, unrelated: onsetTimes.length - used.size, bleeding: fraction >= threshold };
}
