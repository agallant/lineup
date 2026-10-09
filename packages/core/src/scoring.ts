import type { Grade, Judgment } from './judge/types';

export interface ScoreConfig {
  /** Points for a note judged at full credit. */
  pointsPerNote: number;
  /** Combo multiplier grows by this much every `comboStep` notes... */
  multiplierPerStep: number;
  comboStep: number;
  /** ...up to this cap. */
  maxMultiplier: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  pointsPerNote: 100,
  multiplierPerStep: 0.1,
  comboStep: 10,
  maxMultiplier: 2,
};

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
  counts: Record<Grade, number>;
  judged: number;
  /** Mean credit over judged notes, 0..1. */
  accuracy: number;
}

/** Accumulates judgments into score, combo and accuracy. Pure. */
export class Scoreboard {
  private readonly config: ScoreConfig;
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private creditSum = 0;
  private counts: Record<Grade, number> = { perfect: 0, good: 0, miss: 0 };

  constructor(config: Partial<ScoreConfig> = {}) {
    this.config = { ...DEFAULT_SCORE_CONFIG, ...config };
  }

  private multiplierFor(combo: number): number {
    const { multiplierPerStep, comboStep, maxMultiplier } = this.config;
    return Math.min(maxMultiplier, 1 + Math.floor(combo / comboStep) * multiplierPerStep);
  }

  add(j: Judgment): void {
    this.counts[j.grade]++;
    this.creditSum += j.credit;
    if (j.grade === 'miss') {
      this.combo = 0;
      return;
    }
    // Points use the multiplier earned BEFORE this note extends the combo.
    this.score += this.config.pointsPerNote * j.credit * this.multiplierFor(this.combo);
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  get state(): ScoreState {
    const judged = this.counts.perfect + this.counts.good + this.counts.miss;
    return {
      score: Math.round(this.score),
      combo: this.combo,
      maxCombo: this.maxCombo,
      multiplier: this.multiplierFor(this.combo),
      counts: { ...this.counts },
      judged,
      accuracy: judged ? this.creditSum / judged : 0,
    };
  }
}

/** Letter grade for a results screen. */
export function letterGrade(accuracy: number): 'S' | 'A' | 'B' | 'C' | 'D' {
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  if (accuracy >= 0.5) return 'C';
  return 'D';
}
