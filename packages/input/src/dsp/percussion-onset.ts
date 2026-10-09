import { toDb } from './level';
import type { Onset } from './onset';

/** The next frame may sit this far below the rise threshold and still confirm an attack. */
const CONFIRM_SLACK_DB = 4;
/** Frames after the attack frame that must stay above the baseline before it is reported. */
const CONFIRM_FRAMES = 2;

/** Noise-floor tracking: rate per frame while frames are near the floor (and for any drop), and the slower creep through louder ones. */
const FLOOR_DOWN = 0.02;
const FLOOR_CREEP = 0.001;
/** Frames within this many dB above the floor count as "the room", not a hit. */
const FLOOR_TRACK_DB = 4;

export interface PercussionOnsetOptions {
  /** Analysis frame in samples (128 = one AudioWorklet render quantum). */
  frameSize?: number;
  /** A frame must exceed the recent envelope by this many dB to be an attack. */
  riseDb?: number;
  /** How fast the envelope reference falls back, dB per second. Fast enough that a repeated hit of the same loudness stands out after ~40 ms, slow enough that the few-ms level troughs inside a low drum tail cannot re-trigger. */
  releaseDbPerSec?: number;
  /** Frames quieter than this (dBFS RMS) never trigger. */
  minDb?: number;
  /** Minimum time between onsets, seconds. */
  refractory?: number;
  /** Ignore the first stretch of the stream while the reference settles, seconds. */
  warmup?: number;
  /**
   * The reference only sees levels this old, seconds, so an attack that rises
   * over several frames is not absorbed into it while it is still rising.
   */
  referenceDelay?: number;
}

/**
 * Attack detector for percussion. Compares each frame's RMS level with a
 * delayed peak-hold envelope that releases quickly (default 600 dB/s). A sound's own
 * decaying tail can never rise above that envelope, so low drums with long
 * sub-100 Hz tails do not re-trigger the way a "rise over the recent minimum"
 * rule does, while a new hit 10 dB above the tail (or above a quiet room)
 * still stands out. The reference starts at the noise floor seen during
 * warm-up, so the first frames of a stream are not mistaken for a hit.
 */
export class PercussionOnsetDetector {
  private readonly frameSize: number;
  private readonly riseDb: number;
  private readonly releasePerFrame: number;
  private readonly minDb: number;
  private readonly refractoryFrames: number;
  private readonly warmupFrames: number;
  /** Last few frame levels, oldest first; the reference only learns from the oldest. */
  private readonly delayed: number[];
  private readonly frame: Float32Array;
  private framePos = 0;
  private frameStart = 0;
  private frames = 0;
  private ref = -120;
  /** Slow estimate of the noise floor: falls quickly, rises slowly, so hits barely move it. */
  private floor = -120;
  private lastOnset = -Infinity;
  /** An attack seen in the previous frame, waiting to be confirmed by this one. */
  private candidate: { onset: Onset; base: number; seen: number } | null = null;

  constructor(
    sampleRate: number,
    {
      frameSize = 128,
      riseDb = 9,
      releaseDbPerSec = 600,
      minDb = -62,
      refractory = 0.06,
      warmup = 0.1,
      referenceDelay = 0.013,
    }: PercussionOnsetOptions = {},
  ) {
    this.frameSize = frameSize;
    this.riseDb = riseDb;
    this.releasePerFrame = (releaseDbPerSec * frameSize) / sampleRate;
    this.minDb = minDb;
    this.refractoryFrames = Math.round(refractory * sampleRate);
    this.warmupFrames = Math.ceil((warmup * sampleRate) / frameSize);
    this.delayed = new Array<number>(
      Math.max(1, Math.round((referenceDelay * sampleRate) / frameSize)),
    ).fill(-120);
    this.frame = new Float32Array(frameSize);
  }

  /** Consumes a contiguous block starting at stream sample `startFrame`. */
  process(block: Float32Array, startFrame: number): Onset[] {
    const out: Onset[] = [];
    for (let i = 0; i < block.length; i++) {
      if (this.framePos === 0) this.frameStart = startFrame + i;
      this.frame[this.framePos++] = block[i]!;
      if (this.framePos === this.frameSize) {
        const onset = this.analyzeFrame();
        if (onset) out.push(onset);
        this.framePos = 0;
      }
    }
    return out;
  }

  private analyzeFrame(): Onset | null {
    const { frame, frameSize } = this;
    let sumSq = 0;
    let maxAbs = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = frame[i]!;
      sumSq += v * v;
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    const db = toDb(Math.sqrt(sumSq / frameSize));
    this.frames++;

    const before = this.ref;
    // The reference learns from the level `referenceDelay` ago (peak-hold, slow release).
    this.delayed.push(db);
    const old = this.delayed.shift()!;
    this.ref = Math.max(old, this.ref - this.releasePerFrame);
    if (this.frames <= this.warmupFrames) {
      // settle on the room during warm-up: never trigger
      this.ref = Math.max(before, db);
      this.floor = this.frames === 1 ? db : this.floor + (db - this.floor) * 0.1;
      return null;
    }

    // The noise-floor estimate is the room's typical level: it tracks frames near it both ways
    // (so it sits at the mean of the fluctuations, not in their troughs) and creeps up only
    // slowly through loud frames, so a hit barely moves it.
    this.floor +=
      (db - this.floor) *
      (db < this.floor ? FLOOR_DOWN : db < this.floor + FLOOR_TRACK_DB ? FLOOR_DOWN : FLOOR_CREEP);

    // 1. Confirm last frame's candidate: a real hit is still well above its baseline one frame
    //    later; a one-frame noise spike is not.
    if (this.candidate) {
      const { onset, base, seen } = this.candidate;
      this.candidate = null;
      if (db - base >= this.riseDb - CONFIRM_SLACK_DB * (seen + 1)) {
        if (seen + 1 < CONFIRM_FRAMES) {
          this.candidate = { onset, base, seen: seen + 1 };
          return null;
        }
        this.lastOnset = onset.frame;
        return onset;
      }
    }

    // 2. Look for a new candidate.
    if (db < this.minDb) return null;
    // A hit must stand out from the recent decay AND from the room's noise floor, so the few dB of
    // random fluctuation in steady noise can never look like an attack.
    const base = Math.max(before, this.floor);
    if (db - base < this.riseDb) return null;
    if (this.frameStart - this.lastOnset < this.refractoryFrames) return null;

    // Refine within the frame: first sample reaching half the frame's peak.
    let offset = 0;
    while (offset < frameSize - 1 && Math.abs(frame[offset]!) < maxAbs / 2) offset++;
    const velocity = Math.min(1, Math.max(0, (db + 50) / 50)); // -50 dBFS .. 0 dBFS
    this.candidate = { onset: { frame: this.frameStart + offset, velocity, db }, base, seen: 0 };
    return null;
  }
}
