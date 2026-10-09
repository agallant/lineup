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
