import type { InputEvent, PitchFrame } from '@lineup/core';

/** Continuous analysis snapshot for meters and tuner-style displays. */
export interface AnalysisFrame {
  /** Seconds on the AudioContext clock (centre of the pitch window). */
  time: number;
  /** RMS level of the most recent hop, dBFS. */
  rmsDb: number;
  /** Peak absolute sample since the previous frame, dBFS. */
  peakDb: number;
  /** Detected fundamental in Hz, or null when nothing clear is sounding. */
  pitchHz: number | null;
  /** Pitch detector clarity 0..1 (reported even when pitchHz is null). */
  clarity: number;
}

/** Messages posted from the input AudioWorklet to the main thread. */
export type AnalyzerMessage =
  { type: 'input'; event: InputEvent } | { type: 'frame'; frame: AnalysisFrame };

/** The continuous pitch stream view of an analysis frame. */
export function toPitchFrame(frame: AnalysisFrame): PitchFrame {
  return {
    time: frame.time,
    frequency: frame.pitchHz,
    clarity: frame.clarity,
    level: frame.rmsDb,
  };
}
