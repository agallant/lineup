import type { TimbreClass } from './profile';
import {
  MIN_SEPARATION,
  classify,
  classSeparation,
  featureVector,
  trainTimbreModel,
  type TimbreModel,
  type TrainingSample,
} from './timbre';
import type { InputEvent } from './types';

export type EnrollOutcome =
  | 'accepted'
  /** Two onsets inside `doubleWindow`: one physical hit, counted once. */
  | 'double'
  /** Much quieter than the hits so far / than the minimum: probably a stray sound. */
  | 'too-quiet'
  /** Sounds nothing like the hits collected for this class. */
  | 'outlier'
  | 'no-features'
  | 'done';

export interface EnrollmentOptions {
  /** Hits to collect per class. */
  perClass: number;
  /** Onsets closer than this to the previous one are ignored, seconds. */
  doubleWindow: number;
  /** Absolute floor on peak level, dBFS. */
  minPeakDb: number;
  /** Reject a hit this many dB below the class's median so far. */
  quietRelativeDb: number;
  /** Reject a hit this far (standardized) from the class's hits so far, once there are three. */
  outlierDistance: number;
}

export const DEFAULT_ENROLLMENT: EnrollmentOptions = {
  perClass: 6,
  doubleWindow: 0.15,
  minPeakDb: -45,
  quietRelativeDb: 20,
  outlierDistance: 5,
};

/**
 * Collects hits class by class ("clap 6 times", then "tap 6 times"). Feed it
 * onset events; it says what happened to each, and `build()` trains the model.
 */
export class EnrollmentSession {
  readonly options: EnrollmentOptions;
  private readonly samples: TrainingSample[] = [];
  private classIndex = 0;
  private lastTime = -Infinity;

  constructor(
    readonly classes: readonly TimbreClass[],
    options: Partial<EnrollmentOptions> = {},
  ) {
    if (classes.length === 0) throw new Error('enrollment needs at least one class');
    this.options = { ...DEFAULT_ENROLLMENT, ...options };
  }

  /** The class being collected now, or null when finished. */
  get current(): TimbreClass | null {
    return this.classes[this.classIndex] ?? null;
  }

  get done(): boolean {
    return this.classIndex >= this.classes.length;
  }

  countFor(classId: string): number {
    return this.samples.filter((s) => s.classId === classId).length;
  }

  /** Hits collected for the current class. */
  get progress(): number {
    return this.current ? this.countFor(this.current.id) : this.options.perClass;
  }

  add(event: InputEvent): EnrollOutcome {
    const cls = this.current;
    if (!cls) return 'done';
    if (event.time - this.lastTime < this.options.doubleWindow) return 'double';
    const features = event.features;
    if (!featureVector(features) || !features) return 'no-features';
    this.lastTime = event.time;

    const peak = features['peakDb'];
    const mine = this.samples.filter((s) => s.classId === cls.id);
    if (peak !== undefined) {
      if (peak < this.options.minPeakDb) return 'too-quiet';
      if (mine.length >= 2) {
        const peaks = mine.map((s) => s.features['peakDb'] ?? peak).sort((a, b) => a - b);
        const median = peaks[Math.floor(peaks.length / 2)]!;
        if (peak < median - this.options.quietRelativeDb) return 'too-quiet';
      }
    }
    if (mine.length >= 3) {
      const trial = trainTimbreModel(mine);
      const c = classify(trial, features);
      if (c && c.distance > this.options.outlierDistance) return 'outlier';
    }

    this.samples.push({ classId: cls.id, features });
    if (mine.length + 1 >= this.options.perClass) this.classIndex++;
    return 'accepted';
  }

  /** Skip the rest of the current class (e.g. the player cannot make that sound). */
  restartClass(): void {
    const cls = this.current;
    if (!cls) return;
    for (let i = this.samples.length - 1; i >= 0; i--)
      if (this.samples[i]!.classId === cls.id) this.samples.splice(i, 1);
    this.lastTime = -Infinity;
  }

  /** Trains the model. Throws before every class has hits. */
  build(): { model: TimbreModel; warnings: string[] } {
    for (const c of this.classes) {
      if (this.countFor(c.id) < 2) throw new Error(`not enough hits for "${c.label}"`);
    }
    const model = trainTimbreModel(this.samples);
    const warnings: string[] = [];
    for (let i = 0; i < this.classes.length; i++) {
      for (let j = i + 1; j < this.classes.length; j++) {
        const a = this.classes[i]!;
        const b = this.classes[j]!;
        if (classSeparation(model, a.id, b.id) < MIN_SEPARATION) {
          warnings.push(
            `"${a.label}" and "${b.label}" sound too alike to tell apart. Make them more different (clap harder, tap softer or on a different surface) and enroll again.`,
          );
        }
      }
    }
    return { model, warnings };
  }
}
