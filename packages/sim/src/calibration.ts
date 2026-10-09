import {
  estimateOffset,
  type InstrumentProfile,
  type OffsetEstimate,
  type OffsetFailure,
} from '@lineup/core';
import { InputAnalyzer, analyzerOptionsFromProfile } from '@lineup/input';
import { addInto, mixAt, rng, roomNoise, silence, type RoomNoiseOptions } from '@lineup/testkit';

export interface CalibrationSimOptions {
  /** Makes one response sound (a clap, a strum, a tap): sample 0 is the attack. */
  response: (index: number, sampleRate: number) => Float32Array;
  profile: InstrumentProfile;
  /** True latency the player + device add, seconds. */
  latency: number;
  jitter?: number;
  clickCount?: number;
  clickInterval?: number;
  /** Responses the player misses. */
  skip?: Iterable<number>;
  noise?: RoomNoiseOptions | null;
  seed?: number;
  sampleRate?: number;
  ctxStart?: number;
}

/**
 * Simulates the calibration screen: the app schedules clicks on the audio
 * clock, the player responds (late by `latency`, with jitter), the analyzer
 * hears onsets, and estimateOffset compares the two on the same clock.
 */
export function simulateCalibration({
  response,
  profile,
  latency,
  jitter = 0,
  clickCount = 16,
  clickInterval = 0.5,
  skip = [],
  noise = null,
  seed = 1,
  sampleRate = 48000,
  ctxStart = 5.1234,
}: CalibrationSimOptions): {
  estimate: OffsetEstimate | OffsetFailure;
  clicks: number[];
  onsets: number[];
} {
  const random = rng(seed);
  const skipped = new Set(skip);
  const first = ctxStart + 1;
  const clicks = Array.from({ length: clickCount }, (_, i) => first + i * clickInterval);
  const total = silence(clickCount * clickInterval + 2.5, sampleRate);

  clicks.forEach((c, i) => {
    if (skipped.has(i)) return;
    const jit = Math.max(-3, Math.min(3, (random() + random() + random()) * Math.SQRT2)) * jitter; // ~gaussian
    mixAt(total, response(i, sampleRate), c + latency + jit - ctxStart, sampleRate);
  });
  if (noise) addInto(total, roomNoise(total.length / sampleRate, sampleRate, noise));

  const analyzer = new InputAnalyzer(sampleRate, analyzerOptionsFromProfile(profile));
  const startFrame = Math.round(ctxStart * sampleRate);
  const onsets: number[] = [];
  for (let n = 0; n < total.length; n += 128) {
    for (const m of analyzer.process(
      total.subarray(n, Math.min(n + 128, total.length)),
      startFrame + n,
    )) {
      if (m.type === 'input') onsets.push(m.event.time);
    }
  }
  return { estimate: estimateOffset(clicks, onsets), clicks, onsets };
}
