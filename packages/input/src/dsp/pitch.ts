import { PitchDetector } from 'pitchy';
import { rms, toDb } from './level';

export interface PitchTrackerOptions {
  /** Analysis window in samples (power of two). */
  windowSize?: number;
  /** Samples between estimates. */
  hopSize?: number;
  /** Minimum McLeod clarity (0..1) to accept a pitch. */
  minClarity?: number;
  /** Window RMS below this (dBFS) reports no pitch. */
  minDb?: number;
  minHz?: number;
  maxHz?: number;
  /**
   * When the detector reports a pitch exactly one octave outside
   * [minHz, maxHz], shift it into range instead of discarding it. Voices with
   * a weak fundamental (phone mics high-pass the lows) often read an octave
   * high; folding keeps the frame and the right pitch class. Only one octave:
   * anything farther out is noise and stays rejected. Default off.
   */
  foldIntoRange?: boolean;
}

export interface PitchEstimate {
  /** Sample index (on the input stream) of the centre of the window. */
  centerFrame: number;
  /** Hz, or null when the window had no clear, in-range pitch. */
  hz: number | null;
  clarity: number;
  /** RMS of the whole window, dBFS. */
  rmsDb: number;
}

/**
 * Streaming pitch tracker (McLeod pitch method via `pitchy`). Feed it blocks
 * of any size; every `hopSize` samples it estimates the pitch of the last
 * `windowSize` samples.
 */
export class PitchTracker {
  readonly windowSize: number;
  readonly hopSize: number;
  private readonly minClarity: number;
  private readonly minDb: number;
  private readonly minHz: number;
  private readonly maxHz: number;
  private readonly foldIntoRange: boolean;
  private readonly detector: PitchDetector<Float32Array>;
  private readonly ring: Float32Array;
  private readonly window: Float32Array;
  private writePos = 0;
  /** Total samples consumed so far (stream position of the next sample). */
  private position = 0;
  private sinceHop = 0;

  constructor(
    private readonly sampleRate: number,
    {
      windowSize = 2048,
      hopSize = 512,
      minClarity = 0.9,
      minDb = -60,
      // Covers low-G tuning (G3 = 196 Hz) up to ~C6 at the top of the neck.
      minHz = 150,
      maxHz = 1400,
      foldIntoRange = false,
    }: PitchTrackerOptions = {},
  ) {
    this.windowSize = windowSize;
    this.hopSize = hopSize;
    this.minClarity = minClarity;
    this.minDb = minDb;
    this.minHz = minHz;
    this.maxHz = maxHz;
    this.foldIntoRange = foldIntoRange;
    this.detector = PitchDetector.forFloat32Array(windowSize);
    this.detector.minVolumeDecibels = -120;
    this.ring = new Float32Array(windowSize);
    this.window = new Float32Array(windowSize);
  }

  /**
   * Consumes `block`, which must start at stream sample `startFrame` (blocks
   * must be contiguous). Returns any estimates completed inside it.
   */
  process(block: Float32Array, startFrame: number): PitchEstimate[] {
    this.position = startFrame;
    const out: PitchEstimate[] = [];
    for (let i = 0; i < block.length; i++) {
      this.ring[this.writePos] = block[i]!;
      this.writePos = (this.writePos + 1) % this.windowSize;
      this.position++;
      if (++this.sinceHop >= this.hopSize && this.position >= this.windowSize) {
        this.sinceHop = 0;
        out.push(this.estimate());
      }
    }
    return out;
  }

  private estimate(): PitchEstimate {
    const { ring, window, windowSize, writePos } = this;
    // Unroll the ring buffer, oldest sample first.
    window.set(ring.subarray(writePos), 0);
    window.set(ring.subarray(0, writePos), windowSize - writePos);
    const rmsDb = toDb(rms(window));
    const centerFrame = this.position - windowSize / 2;
    if (rmsDb < this.minDb) return { centerFrame, hz: null, clarity: 0, rmsDb };
    const [raw, clarity] = this.detector.findPitch(window, this.sampleRate);
    const hz = this.foldIntoRange ? this.fold(raw) : raw;
    const ok = clarity >= this.minClarity && hz >= this.minHz && hz <= this.maxHz;
    return { centerFrame, hz: ok ? hz : null, clarity, rmsDb };
  }

  /**
   * Shifts a detection that is exactly one octave outside [minHz, maxHz] back in.
   * One octave only: octave errors are 2x, while far-out-of-range readings
   * (hiss, HF noise) are garbage that must stay rejected, not be halved until
   * they look like a pitch.
   */
  private fold(hz: number): number {
    if (hz > this.maxHz && hz / 2 <= this.maxHz && hz / 2 >= this.minHz) return hz / 2;
    if (hz < this.minHz && hz * 2 >= this.minHz && hz * 2 <= this.maxHz) return hz * 2;
    return hz;
  }
}
