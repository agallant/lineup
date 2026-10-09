import { toDb } from './level';

export interface OnsetDetectorOptions {
  /** Analysis frame in samples. 128 = one AudioWorklet render quantum. */
  frameSize?: number;
  /** Required rise (dB) over the quietest frame in the lookback. */
  riseDb?: number;
  /** How far back to look for that quietest frame, seconds. */
  lookback?: number;
  /** Frames quieter than this (dBFS, of the differenced signal) never trigger. */
  minDb?: number;
  /** Minimum time between onsets, seconds. Also merges a strum's 4 strings. */
  refractory?: number;
}

export interface Onset {
  /** Stream sample index of the attack. */
  frame: number;
  /** 0..1 attack strength. */
  velocity: number;
  /** Level of the triggering frame, dBFS. */
  db: number;
}

/**
 * Energy-rise onset detector on the first difference of the signal (a cheap
 * high-frequency-content weighting). A pick or nail attack is broadband,
 * while a string that is still ringing has lost most of its highs, so
 * re-plucks of a ringing string still stand out.
 */
export class OnsetDetector {
  private readonly frameSize: number;
  private readonly riseDb: number;
  private readonly minDb: number;
  private readonly refractoryFrames: number;
  private readonly history: Float32Array;
  private historyPos = 0;
  private readonly frame: Float32Array;
  private framePos = 0;
  private frameStart = 0;
  private prevSample = 0;
  private lastOnset = -Infinity;

  constructor(
    sampleRate: number,
    {
      frameSize = 128,
      riseDb = 10,
      lookback = 0.03,
      minDb = -60,
      refractory = 0.07,
    }: OnsetDetectorOptions = {},
  ) {
    this.frameSize = frameSize;
    this.riseDb = riseDb;
    this.minDb = minDb;
    this.refractoryFrames = Math.round(refractory * sampleRate);
    const lookbackFrames = Math.max(1, Math.round((lookback * sampleRate) / frameSize));
    this.history = new Float32Array(lookbackFrames).fill(-120);
    this.frame = new Float32Array(frameSize);
  }

  /** Consumes a contiguous block starting at stream sample `startFrame`. */
  process(block: Float32Array, startFrame: number): Onset[] {
    const out: Onset[] = [];
    for (let i = 0; i < block.length; i++) {
      if (this.framePos === 0) this.frameStart = startFrame + i;
      const x = block[i]!;
      this.frame[this.framePos++] = x - this.prevSample;
      this.prevSample = x;
      if (this.framePos === this.frameSize) {
        const onset = this.analyzeFrame();
        if (onset) out.push(onset);
        this.framePos = 0;
      }
    }
    return out;
  }

  private analyzeFrame(): Onset | null {
    const { frame, frameSize, history } = this;
    let energy = 0;
    let maxAbs = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = frame[i]!;
      energy += v * v;
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    const db = toDb(Math.sqrt(energy / frameSize));

    let floor = Infinity;
    for (let i = 0; i < history.length; i++) floor = Math.min(floor, history[i]!);
    history[this.historyPos] = db;
    this.historyPos = (this.historyPos + 1) % history.length;

    if (db < this.minDb || db - floor < this.riseDb) return null;
    if (this.frameStart - this.lastOnset < this.refractoryFrames) return null;

    // Refine within the frame: first sample reaching half the frame's peak.
    let offset = 0;
    while (offset < frameSize - 1 && Math.abs(frame[offset]!) < maxAbs / 2) offset++;
    const at = this.frameStart + offset;
    this.lastOnset = at;
    const velocity = Math.min(1, Math.max(0, (db - this.minDb) / -this.minDb));
    return { frame: at, velocity, db };
  }
}
