import type { InputEvent } from '@lineup/core';
import type { AnalyzerMessage } from '../types';
import { MIN_DB, toDb } from './level';
import type { Onset } from './onset';

export interface OnsetWindowConfig {
  sampleRate: number;
  /** Samples analysed after each onset. */
  window: number;
  /** Where the window starts relative to the onset, samples (negative: before it, to include the attack). */
  offset: number;
  /** Samples between level frames (for meters). */
  frameHop: number;
  /** Finds onsets in a block of the stream. */
  detect: (block: Float32Array, startFrame: number) => Onset[];
  /**
   * Cut a window short where the next onset begins (minus this many samples), so a later hit
   * does not contaminate the description of an earlier one. The cut is best-effort when onset
   * detection and window emission fall in different blocks. Omitted: windows are always full.
   */
  cutAtNextOnset?: number;
  /** Reads the window of audio behind one onset into extra event fields (features, chord...). */
  describe: (samples: Float32Array, onset: Onset) => Partial<InputEvent>;
}

interface Pending {
  onset: Onset;
  /** Absolute stream index of the first analysed sample. */
  from: number;
}

/**
 * The shared plumbing of the analyzers that describe each onset by a window
 * of audio around it (percussion timbre, strum chords): keep a ring buffer,
 * hold each onset until its window has arrived, then emit an `input` event at
 * the ONSET time with whatever `describe` found. Level `frame` messages are
 * emitted regularly for meters (no pitch: pitchHz is null).
 */
export class OnsetWindowAnalyzer {
  private readonly ring: Float32Array;
  private readonly size: number;
  private readonly pending: Pending[] = [];
  private streamStart: number | null = null;
  private end = 0; // absolute index just past the newest sample
  private sumSq = 0;
  private peak = 0;
  private count = 0;

  constructor(private readonly config: OnsetWindowConfig) {
    this.size = (config.window + Math.abs(config.offset)) * 4;
    this.ring = new Float32Array(this.size);
  }

  process(block: Float32Array, startFrame: number): AnalyzerMessage[] {
    const { window, frameHop, sampleRate } = this.config;
    // a pending window must never be overwritten by the rest of the same block
    const maxBlock = this.size - window;
    if (block.length > maxBlock) {
      const all: AnalyzerMessage[] = [];
      for (let at = 0; at < block.length; at += maxBlock) {
        all.push(...this.process(block.subarray(at, at + maxBlock), startFrame + at));
      }
      return all;
    }
    if (this.streamStart === null) this.streamStart = startFrame;
    const out: AnalyzerMessage[] = [];

    for (let i = 0; i < block.length; i++) {
      const v = block[i]!;
      this.ring[(startFrame + i) % this.size] = v;
      this.sumSq += v * v;
      this.peak = Math.max(this.peak, Math.abs(v));
      if (++this.count >= frameHop) {
        const pos = startFrame + i + 1;
        out.push({
          type: 'frame',
          frame: {
            time: (pos - this.count / 2) / sampleRate,
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

    for (const onset of this.config.detect(block, startFrame)) {
      this.pending.push({
        onset,
        from: Math.max(this.streamStart, onset.frame + this.config.offset),
      });
    }

    while (this.pending.length && this.end >= this.pending[0]!.from + window) {
      const { onset, from } = this.pending.shift()!;
      let length = window;
      const next = this.pending[0];
      if (next && this.config.cutAtNextOnset !== undefined) {
        length = Math.max(
          0,
          Math.min(window, next.onset.frame - this.config.cutAtNextOnset - from),
        );
      }
      const samples = new Float32Array(length);
      for (let i = 0; i < length; i++) samples[i] = this.ring[(from + i) % this.size]!;
      out.push({
        type: 'input',
        event: {
          time: onset.frame / sampleRate,
          kind: 'onset',
          velocity: onset.velocity,
          ...this.config.describe(samples, onset),
        },
      });
    }
    return out;
  }
}
