import type { ContinuousJudgeConfig } from './continuous';

/** How forgiving sustained-pitch scoring is. "strict" is the profile's own numbers. */
export type Difficulty = 'easy' | 'normal' | 'strict';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'strict'];

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

interface Preset {
  toleranceCents: number;
  perfectWindow: number;
  goodWindow: number;
  coverageGood: number;
  coveragePerfect: number;
}

const PRESETS: Record<Exclude<Difficulty, 'strict'>, Preset> = {
  easy: {
    toleranceCents: 100,
    perfectWindow: 0.3,
    goodWindow: 0.6,
    coverageGood: 0.2,
    coveragePerfect: 0.5,
  },
  normal: {
    toleranceCents: 80,
    perfectWindow: 0.24,
    goodWindow: 0.5,
    coverageGood: 0.28,
    coveragePerfect: 0.6,
  },
};

/**
 * Loosens a continuous-judge config for the chosen difficulty. It only ever
 * relaxes a setting (a profile that is already looser keeps its own value),
 * and "strict" returns the config unchanged.
 */
export function applyDifficulty(
  config: ContinuousJudgeConfig,
  difficulty: Difficulty,
): ContinuousJudgeConfig {
  if (difficulty === 'strict') return config;
  const p = PRESETS[difficulty];
  return {
    ...config,
    toleranceCents: Math.max(config.toleranceCents, p.toleranceCents),
    perfectWindow: Math.max(config.perfectWindow, p.perfectWindow),
    goodWindow: Math.max(config.goodWindow, p.goodWindow),
    coverageGood: Math.min(config.coverageGood, p.coverageGood),
    coveragePerfect: Math.min(config.coveragePerfect, p.coveragePerfect),
  };
}
