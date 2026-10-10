import type { AnalyzerMessage } from '../types';
import { MIN_DB, toDb } from './level';
import { OnsetDetector, type OnsetDetectorOptions } from './onset';
import { PercussionAnalyzer, type PercussionAnalyzerOptions } from './percussion-analyzer';
import { PitchTracker, type PitchTrackerOptions } from './pitch';
import { StrumAnalyzer, type StrumAnalyzerOptions } from './strum-analyzer';

export interface InputAnalyzerOptions {
  pitch?: PitchTrackerOptions;
  onset?: OnsetDetectorOptions;
  /**
   * Percussion mode: onsets with timbre features instead of pitch tracking
   * (no PitchTracker runs). Level `frame` messages are still emitted.
   */
  percussion?: PercussionAnalyzerOptions;
  /**
   * Strum mode: onsets with chord recognition (no PitchTracker runs). Level
   * `frame` messages are still emitted.
   */
  strum?: StrumAnalyzerOptions;
}

/**
 * Everything the input AudioWorklet does, as a plain class: feed it render
 * quanta with their stream position, get back messages to post. Kept free of
 * AudioWorklet globals so it runs under Vitest.
 */
export class InputAnalyzer {
  private readonly pitch: PitchTracker | null;
  private readonly onsets: OnsetDetector | null;
  private readonly percussion: PercussionAnalyzer | null;
  private readonly strum: StrumAnalyzer | null;
  private peakSinceFrame = 0;
  private hopSumSq = 0;
  private hopCount = 0;

  constructor(
    private readonly sampleRate: number,
    options: InputAnalyzerOptions = {},
  ) {
    this.percussion = options.percussion
      ? new PercussionAnalyzer(sampleRate, options.percussion)
      : null;
    this.strum = options.strum ? new StrumAnalyzer(sampleRate, options.strum) : null;
    const windowed = this.percussion || this.strum;
    this.pitch = windowed ? null : new PitchTracker(sampleRate, options.pitch);
    this.onsets = windowed ? null : new OnsetDetector(sampleRate, options.onset);
  }

  process(block: Float32Array, startFrame: number): AnalyzerMessage[] {
    if (this.percussion) return this.percussion.process(block, startFrame);
    if (this.strum) return this.strum.process(block, startFrame);
    const out: AnalyzerMessage[] = [];
    if (!this.onsets || !this.pitch) return out;

    for (const o of this.onsets.process(block, startFrame)) {
      out.push({
        type: 'input',
        event: { time: o.frame / this.sampleRate, kind: 'onset', velocity: o.velocity },
      });
    }

    for (let i = 0; i < block.length; i++) {
      const v = block[i]!;
      this.peakSinceFrame = Math.max(this.peakSinceFrame, Math.abs(v));
      this.hopSumSq += v * v;
      this.hopCount++;
    }

    for (const p of this.pitch.process(block, startFrame)) {
      const rmsDb = this.hopCount ? toDb(Math.sqrt(this.hopSumSq / this.hopCount)) : MIN_DB;
      out.push({
        type: 'frame',
        frame: {
          time: p.centerFrame / this.sampleRate,
          rmsDb,
          peakDb: toDb(this.peakSinceFrame),
          pitchHz: p.hz,
          clarity: p.clarity,
        },
      });
      this.peakSinceFrame = 0;
      this.hopSumSq = 0;
      this.hopCount = 0;
    }
    return out;
  }
}
