/**
 * What the audio module emits to the rest of the game. Times are seconds on
 * the AudioContext clock (`AudioContext.currentTime`), uncorrected for input
 * latency: the judge applies the calibrated offset.
 */
export interface InputEvent {
  /** Seconds on the AudioContext clock. */
  time: number;
  kind: InputEventKind;
  /** Fundamental frequency in Hz, when known. */
  pitch?: number;
  /** Attack strength, 0..1. */
  velocity?: number;
}

/** 'onset': a pluck, strum or tap was detected. More kinds arrive with M4+. */
export type InputEventKind = 'onset';

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
