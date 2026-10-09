import type { ChartNote } from '../chart';
import { centsBetween, midiToFrequency } from '../notes';
import type { InstrumentProfile } from '../profile';
import type { PitchFrame } from '../types';
import type { Grade, Judge, Judgment, MissReason } from './types';

export interface ContinuousJudgeConfig {
  /** Calibrated latency, seconds, subtracted from every frame time. */
  latencyOffset: number;
  /** Entering within this long of the note's start (either side) earns "perfect", seconds. */
  perfectWindow: number;
  /** Entering later than this is still scored on coverage, but never "perfect"; also the early look-back. */
  goodWindow: number;
  /** A frame is "on pitch" within this many cents of the target. */
  toleranceCents: number;
  /** Count the right pitch class in any octave. */
  octaveForgiving: boolean;
  /** Take the median deviation over this long (within the note) before testing it, so vibrato doesn't count against you. 0 = off. */
  vibratoSmoothing: number;
  /** Fraction of the sustain that must be on pitch to avoid a miss. */
  coverageGood: number;
  /** Fraction of the sustain that must be on pitch (with a timely entry) for "perfect". */
  coveragePerfect: number;
  /** Frames below this detector clarity are ignored (treated as not singing). */
  minClarity: number;
  /** Frames below this level (dBFS) are ignored. */
  minLevelDb: number;
  /** Nominal seconds between frames (hop / sample rate). */
  frameInterval: number;
  /** Wait this long after a note ends before resolving it (frames in flight), seconds. */
  settle: number;
  /** Notes shorter than this are judged as if this long. */
  minNoteDuration: number;
}

export const DEFAULT_CONTINUOUS_CONFIG: ContinuousJudgeConfig = {
  latencyOffset: 0,
  perfectWindow: 0.18,
  goodWindow: 0.4,
  toleranceCents: 60,
  octaveForgiving: true,
  vibratoSmoothing: 0.18,
  coverageGood: 0.35,
  coveragePerfect: 0.75,
  minClarity: 0.85,
  minLevelDb: -55,
  frameInterval: 256 / 48000,
  settle: 0.15,
  minNoteDuration: 0.2,
};

/** Builds the judge config from a voice-style profile; `frameInterval` is hop / the context's sample rate. */
export function continuousConfigFromProfile(
  profile: InstrumentProfile,
  latencyOffset: number,
  frameInterval: number,
): ContinuousJudgeConfig {
  const pitch = profile.judgment.pitch;
  if (!pitch) throw new Error(`profile "${profile.id}" has no judgment.pitch settings`);
  return {
    latencyOffset,
    perfectWindow: profile.judgment.timing.perfectMs / 1000,
    goodWindow: profile.judgment.timing.goodMs / 1000,
    toleranceCents: pitch.toleranceCents,
    octaveForgiving: pitch.octaveForgiving,
    vibratoSmoothing: pitch.vibratoSmoothingMs / 1000,
    coverageGood: pitch.coverageGood,
    coveragePerfect: pitch.coveragePerfect,
    minClarity: profile.detector.clarityThreshold,
    minLevelDb: profile.detector.minLevelDb,
    frameInterval,
    settle: 0.15,
    minNoteDuration: 0.2,
  };
}

interface Stored {
  /** Latency-corrected song time. */
  time: number;
  /** Signed cents from the target-independent frequency: kept as Hz, compared per note. */
  hz: number | null;
}

/** What a note's frames add up to. */
export interface NoteStats {
  /** Fraction of the sustain that was on pitch, 0..1. */
  coverage: number;
  /** Seconds after the note's start that the singer was first on pitch; 0 if already on pitch at the start; null if never. */
  entry: number | null;
  /** Mean signed cents of the smoothed deviation over voiced frames, or null with none. */
  meanCents: number | null;
  /** Any frame in the note's window that passed the clarity/level gate. */
  voiced: boolean;
}

const EPS = 1e-9;

/**
 * Judges sustained pitch (voice, later winds). Resolves each note once it and
 * its settle time have passed, from the frames that fell inside it.
 */
export class ContinuousJudge implements Judge<PitchFrame> {
  readonly config: ContinuousJudgeConfig;
  private readonly notes: readonly ChartNote[];
  private readonly resolved: (Judgment | undefined)[];
  private readonly pending: Judgment[] = [];
  private readonly all: Judgment[] = [];
  private frames: Stored[] = [];
  private firstOpen = 0;

  constructor(notes: readonly ChartNote[], config: Partial<ContinuousJudgeConfig> = {}) {
    this.config = { ...DEFAULT_CONTINUOUS_CONFIG, ...config };
    this.notes = notes;
    this.resolved = new Array<Judgment | undefined>(notes.length).fill(undefined);
  }

  get judgments(): readonly Judgment[] {
    return this.all;
  }

  judgmentFor(noteIndex: number): Judgment | undefined {
    return this.resolved[noteIndex];
  }

  feed(frame: PitchFrame): void {
    const { minClarity, minLevelDb, latencyOffset } = this.config;
    const usable =
      frame.frequency !== null &&
      frame.frequency > 0 &&
      frame.clarity >= minClarity &&
      frame.level >= minLevelDb;
    this.frames.push({ time: frame.time - latencyOffset, hz: usable ? frame.frequency : null });
  }

  advance(now: number): Judgment[] {
    const { latencyOffset, settle } = this.config;
    const corrected = now - latencyOffset;
    for (let i = this.firstOpen; i < this.notes.length; i++) {
      const note = this.notes[i]!;
      if (this.end(note) + settle > corrected + EPS) break;
      if (!this.resolved[i]) this.resolve(i, now);
    }
    this.prune();
    return this.drain();
  }

  finish(now = Infinity): Judgment[] {
    for (let i = this.firstOpen; i < this.notes.length; i++) {
      if (!this.resolved[i]) this.resolve(i, now);
    }
    return this.drain();
  }

  /**
   * What the frames received so far say about a note: for live feedback (is the
   * singer on pitch right now, how much of the note so far). `now` is song
   * time on the raw clock; only the part of the note up to `now` is counted.
   */
  peek(noteIndex: number, now: number): NoteStats & { onPitchNow: boolean } {
    const note = this.notes[noteIndex];
    if (!note)
      return { coverage: 0, entry: null, meanCents: null, voiced: false, onPitchNow: false };
    const upTo = Math.min(this.end(note), now - this.config.latencyOffset);
    const stats = this.stats(note, upTo);
    const last = this.frames[this.frames.length - 1];
    const recent = last !== undefined && upTo - last.time < 0.12;
    const dev = recent && last.hz !== null ? this.deviation(note, last.hz) : null;
    return { ...stats, onPitchNow: dev !== null && Math.abs(dev) <= this.config.toleranceCents };
  }

  // ---- internals ----

  private end(note: ChartNote): number {
    return note.t + Math.max(note.duration, this.config.minNoteDuration);
  }

  /** Signed cents of `hz` against the note, folded to the nearest octave if forgiving. */
  private deviation(note: ChartNote, hz: number): number | null {
    if (note.pitch === undefined) return null;
    let cents = centsBetween(hz, midiToFrequency(note.pitch));
    if (this.config.octaveForgiving) cents -= 1200 * Math.round(cents / 1200);
    return cents;
  }

  private stats(note: ChartNote, upTo: number): NoteStats {
    const { frameInterval, toleranceCents, vibratoSmoothing } = this.config;
    // Two frames of look-back so a run already under way at the note's start (early, or held over
    // from a previous note of the same pitch) is seen as continuing.
    const lookback = 2 * frameInterval;
    const start = note.t;
    const end = this.end(note);
    const horizon = Math.min(end, upTo);

    let onPitchFrames = 0;
    let voiced = false;
    let entry: number | null = null;
    let runStart: number | null = null;
    let runLength = 0;
    let sum = 0;
    let n = 0;

    // Only frames inside the note count toward coverage; the look-back only seeds run detection.
    const win: { time: number; dev: number }[] = [];
    for (const f of this.frames) {
      if (f.time < start - lookback - EPS || f.time > horizon + EPS) continue;
      if (f.hz === null) {
        runStart = null;
        runLength = 0;
        continue;
      }
      const dev = this.deviation(note, f.hz);
      if (dev === null) continue;
      if (f.time >= start - EPS) voiced = true;

      // A run is consecutive on-pitch frames. Entry is the first run (two frames) that is on pitch
      // at or after the note's start; a run already under way counts as on time, so only LATE
      // entry is penalised.
      const inTolerance = Math.abs(dev) <= toleranceCents;
      if (inTolerance) {
        if (runStart === null) {
          runStart = f.time;
          runLength = 0;
        }
        runLength++;
      } else {
        runStart = null;
        runLength = 0;
      }
      if (entry === null && inTolerance && f.time >= start - EPS && runLength >= 2) {
        entry = Math.max(0, runStart! - start);
      }
      if (f.time >= start - EPS) win.push({ time: f.time, dev });
    }

    // Smoothed deviation: the MEDIAN over a short window of frames inside this note (the previous
    // note can't drag it). A median is as vibrato-neutral as a mean over a full cycle, but ignores the
    // occasional garbage frame that a permissive clarity gate lets through.
    for (let i = 0; i < win.length; i++) {
      const f = win[i]!;
      let smoothed = f.dev;
      if (vibratoSmoothing > 0) {
        const devs: number[] = [];
        for (let j = i; j >= 0 && f.time - win[j]!.time <= vibratoSmoothing + EPS; j--)
          devs.push(win[j]!.dev);
        devs.sort((a, b) => a - b);
        const mid = devs.length >> 1;
        smoothed = devs.length % 2 ? devs[mid]! : (devs[mid - 1]! + devs[mid]!) / 2;
      }
      sum += smoothed;
      n++;
      if (Math.abs(smoothed) <= toleranceCents) onPitchFrames++;
    }

    const expectedFrames = Math.max(1, (horizon - start) / frameInterval);
    return {
      coverage: Math.min(1, (onPitchFrames * 1) / expectedFrames),
      entry,
      meanCents: n ? sum / n : null,
      voiced,
    };
  }

  private resolve(index: number, now: number): void {
    const note = this.notes[index]!;
    const { coverageGood, coveragePerfect, perfectWindow } = this.config;
    const s = this.stats(note, Infinity);

    let grade: Grade;
    let reason: MissReason | null = null;
    if (s.coverage < coverageGood || s.entry === null) {
      grade = 'miss';
      reason = s.voiced ? 'wrong-pitch' : 'no-input';
    } else if (s.coverage >= coveragePerfect && Math.abs(s.entry) <= perfectWindow) {
      grade = 'perfect';
    } else {
      grade = 'good';
    }

    const j: Judgment = {
      noteIndex: index,
      note,
      grade,
      credit: grade === 'miss' ? 0 : s.coverage,
      timingError: s.entry,
      reason,
      coverage: s.coverage,
      resolvedAt: now,
    };
    if (s.meanCents !== null) j.pitchErrorCents = s.meanCents;
    this.resolved[index] = j;
    this.pending.push(j);
    this.all.push(j);
    while (this.firstOpen < this.notes.length && this.resolved[this.firstOpen]) this.firstOpen++;
  }

  /** Frames older than anything an open note (or its look-back) can use are dropped. */
  private prune(): void {
    const open = this.notes[this.firstOpen];
    const keepFrom = (open ? open.t : Infinity) - this.config.goodWindow - 1;
    if (keepFrom === Infinity) {
      this.frames = [];
      return;
    }
    let drop = 0;
    while (drop < this.frames.length && this.frames[drop]!.time < keepFrom) drop++;
    if (drop > 0) this.frames = this.frames.slice(drop);
  }

  private drain(): Judgment[] {
    return this.pending.splice(0, this.pending.length);
  }
}
