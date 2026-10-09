/**
 * What the input layer emits to the rest of the game. Times are seconds on the
 * AudioContext clock (`AudioContext.currentTime`), uncorrected for input
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
  /** Lane id, set by a classifier (percussion timbre, strum direction). */
  lane?: string;
  /** Detector features behind the event (spectral centroid, band energies...), for classifiers and debugging. */
  features?: Readonly<Record<string, number>>;
}

/** 'onset': a pluck, strum or tap was detected. More kinds arrive with M4+. */
export type InputEventKind = 'onset';

/**
 * One reading from the continuous pitch tracker, emitted every hop whether or
 * not anything is being sung. Times are on the same clock as InputEvent.
 */
export interface PitchFrame {
  /** Seconds; the centre of the analysis window. */
  time: number;
  /** Fundamental in Hz, or null when nothing clear is sounding (unvoiced, too quiet, out of range). */
  frequency: number | null;
  /** Detector confidence 0..1 (reported even when frequency is null). */
  clarity: number;
  /** RMS level of the window, dBFS. */
  level: number;
}
