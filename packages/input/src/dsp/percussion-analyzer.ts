import type { AnalyzerMessage } from '../types';
import { MIN_DB, toDb } from './level';
import type { Onset } from './onset';
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

interface Pending {
  onset: Onset;
  /** Absolute stream index of the first analysed sample. */
  from: number;
}

/**
 * Onset detection plus timbre features, for percussion. Each onset is held
 * until its analysis window has arrived (about 43 ms), then emitted as an
 * `input` event carrying `features`; the event keeps the ONSET time. Level
 * `frame` messages are emitted regularly for meters (no pitch: pitchHz is null).
 */
export class PercussionAnalyzer {
  private readonly onsets: PercussionOnsetDetector;
  private readonly window: number;
  private readonly pre: number;
  private readonly frameHop: number;
  private readonly ring: Float32Array;
  private readonly size: number;
  private readonly pending: Pending[] = [];
  private streamStart: number | null = null;
  private end = 0; // absolute index just past the newest sample
  private sumSq = 0;
  private peak = 0;
  private count = 0;

  constructor(
    private readonly sampleRate: number,
    { onset, window = FEATURE_WINDOW, pre = 0.002, frameHop = 512 }: PercussionAnalyzerOptions = {},
  ) {
    this.onsets = new PercussionOnsetDetector(sampleRate, onset);
    this.window = window;
    this.pre = Math.round(pre * sampleRate);
    this.frameHop = frameHop;
    this.size = (window + this.pre) * 4;
    this.ring = new Float32Array(this.size);
  }

  process(block: Float32Array, startFrame: number): AnalyzerMessage[] {
    if (this.streamStart === null) this.streamStart = startFrame;
    const out: AnalyzerMessage[] = [];

    for (let i = 0; i < block.length; i++) {
      const v = block[i]!;
      this.ring[(startFrame + i) % this.size] = v;
      this.sumSq += v * v;
      this.peak = Math.max(this.peak, Math.abs(v));
      if (++this.count >= this.frameHop) {
        const pos = startFrame + i + 1;
        out.push({
          type: 'frame',
          frame: {
            time: (pos - this.count / 2) / this.sampleRate,
            rmsDb: this.count ? toDb(Math.sqrt(this.sumSq / this.count)) : MIN_DB,
            peakDb: toDb(this.peak),
            pitchHz: null,
            clarity: 0,
          },
        });
        this.sumSq = 0;
        this.peak = 0;
        this.count = 0;
      }
    }
    this.end = startFrame + block.length;

    for (const onset of this.onsets.process(block, startFrame)) {
      this.pending.push({ onset, from: Math.max(this.streamStart, onset.frame - this.pre) });
    }

    while (this.pending.length && this.end >= this.pending[0]!.from + this.window) {
      const { onset, from } = this.pending.shift()!;
      const samples = new Float32Array(this.window);
      for (let i = 0; i < this.window; i++) samples[i] = this.ring[(from + i) % this.size]!;
      const features = featuresToRecord(extractFeatures(samples, this.sampleRate));
      out.push({
        type: 'input',
        event: {
          time: onset.frame / this.sampleRate,
          kind: 'onset',
          velocity: onset.velocity,
          features,
        },
      });
    }
    return out;
  }
}
