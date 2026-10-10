import type { AnalyzerMessage } from '../types';
import {
  CHORD_WINDOW,
  ChordRecognizer,
  type ChordRecognizerOptions,
  type ChordShapes,
} from './chord';
import { OnsetDetector, type OnsetDetectorOptions } from './onset';
import { OnsetWindowAnalyzer } from './onset-window';

/** Shortest stretch of audio a chord is decided from (about 50 ms: a semitone near C4 is 15 Hz, a 50 ms Hann window resolves ~40 Hz, so closed sets only). */
const MIN_CHORD_SAMPLES = 2400;

export interface StrumAnalyzerOptions {
  onset?: OnsetDetectorOptions;
  /** The chords this song uses (name -> MIDI notes of the four strings). Without them events carry no chord. */
  chords?: ChordShapes;
  chord?: ChordRecognizerOptions;
  /** Seconds to skip after the attack so all four strings of the strum are inside the window. */
  skip?: number;
  /** Samples between level frames (for meters). */
  frameHop?: number;
}

/**
 * Strum detection plus chord recognition. Each onset is held until the audio
 * after its strum has arrived (skip + 8192 samples, about 0.2 s), then
 * emitted as an `input` event at the ONSET time, with `chord` and
 * `chordScore` when one of the song's chords fits clearly. Strum direction is
 * not detected: in simulation it could not be told from the audio reliably at
 * realistic strum speeds (see README, known limitations).
 */
export class StrumAnalyzer {
  private readonly windows: OnsetWindowAnalyzer;

  constructor(
    sampleRate: number,
    { onset, chords, chord, skip = 0.03, frameHop = 512 }: StrumAnalyzerOptions = {},
  ) {
    const detector = new OnsetDetector(sampleRate, onset);
    const recognizer =
      chords && Object.keys(chords).length > 0
        ? new ChordRecognizer(chords, sampleRate, chord)
        : null;
    this.windows = new OnsetWindowAnalyzer({
      sampleRate,
      window: CHORD_WINDOW,
      offset: Math.round(skip * sampleRate),
      frameHop,
      // a following strum (down-up-down at 120 ms) must not leak into this strum's chord
      cutAtNextOnset: Math.round(0.004 * sampleRate),
      detect: (block, startFrame) => detector.process(block, startFrame),
      describe: (samples) => {
        // too little audio before the next strum to tell chords apart: report the timing alone
        if (samples.length < MIN_CHORD_SAMPLES) return {};
        const match = recognizer?.recognize(samples);
        return match ? { chord: match.chord, chordScore: match.score } : {};
      },
    });
  }

  process(block: Float32Array, startFrame: number): AnalyzerMessage[] {
    return this.windows.process(block, startFrame);
  }
}
