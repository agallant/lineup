import type { AnalyzerMessage } from '../types';
import { OnsetWindowAnalyzer } from './onset-window';
import { PercussionOnsetDetector, type PercussionOnsetOptions } from './percussion-onset';
import { FEATURE_WINDOW, extractFeatures, featuresToRecord } from './percussion';

export interface PercussionAnalyzerOptions {
  onset?: PercussionOnsetOptions;
  /** Samples analysed after each onset. */
  window?: number;
  /** Seconds of signal kept before the onset so the attack is inside the window. */
  pre?: number;
  /** Samples between level frames (for meters). */
  frameHop?: number;
}

/**
 * Onset detection plus timbre features, for percussion. Each onset is held
 * until its analysis window has arrived (about 43 ms), then emitted as an
 * `input` event carrying `features`; the event keeps the ONSET time. Level
 * `frame` messages are emitted regularly for meters (no pitch: pitchHz is null).
 */
export class PercussionAnalyzer {
  private readonly windows: OnsetWindowAnalyzer;

  constructor(
    sampleRate: number,
    { onset, window = FEATURE_WINDOW, pre = 0.002, frameHop = 512 }: PercussionAnalyzerOptions = {},
  ) {
    const detector = new PercussionOnsetDetector(sampleRate, onset);
    this.windows = new OnsetWindowAnalyzer({
      sampleRate,
      window,
      offset: -Math.round(pre * sampleRate),
      frameHop,
      detect: (block, startFrame) => detector.process(block, startFrame),
      describe: (samples) => ({ features: featuresToRecord(extractFeatures(samples, sampleRate)) }),
    });
  }

  process(block: Float32Array, startFrame: number): AnalyzerMessage[] {
    return this.windows.process(block, startFrame);
  }
}
