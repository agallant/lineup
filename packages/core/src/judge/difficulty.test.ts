import { describe, expect, it } from 'vitest';
import type { ChartNote } from '../chart';
import { midiToFrequency } from '../notes';
import { getProfile } from '../profiles';
import type { PitchFrame } from '../types';
import { ContinuousJudge, continuousConfigFromProfile } from './continuous';
import { DIFFICULTIES, applyDifficulty, isDifficulty } from './difficulty';

const HOP = 256 / 48000;
const base = continuousConfigFromProfile(getProfile('voice'), 0, HOP);
const C4 = midiToFrequency(60);

describe('applyDifficulty', () => {
  it('strict is the profile unchanged', () => {
    expect(applyDifficulty(base, 'strict')).toBe(base);
  });

  it('easy is looser than normal, which is looser than strict', () => {
    const [easy, normal] = [applyDifficulty(base, 'easy'), applyDifficulty(base, 'normal')];
    expect(easy.toleranceCents).toBeGreaterThan(normal.toleranceCents);
    expect(normal.toleranceCents).toBeGreaterThan(base.toleranceCents);
    expect(easy.coveragePerfect).toBeLessThan(normal.coveragePerfect);
    expect(normal.coveragePerfect).toBeLessThan(base.coveragePerfect);
    expect(easy.coverageGood).toBeLessThan(normal.coverageGood);
    expect(easy.goodWindow).toBeGreaterThan(normal.goodWindow);
  });

  it('never tightens a setting the profile already loosened', () => {
    const loose = { ...base, toleranceCents: 150, coveragePerfect: 0.3 };
    const out = applyDifficulty(loose, 'easy');
    expect(out.toleranceCents).toBe(150);
    expect(out.coveragePerfect).toBe(0.3);
  });

  it('leaves unrelated settings alone', () => {
    const out = applyDifficulty(base, 'easy');
    expect(out.minClarity).toBe(base.minClarity);
    expect(out.minLevelDb).toBe(base.minLevelDb);
    expect(out.vibratoSmoothing).toBe(base.vibratoSmoothing);
  });

  it('recognises the difficulty names', () => {
    for (const d of DIFFICULTIES) expect(isDifficulty(d)).toBe(true);
    expect(isDifficulty('hard')).toBe(false);
    expect(isDifficulty(undefined)).toBe(false);
  });
});

describe('what a singer who is 70 cents flat scores', () => {
  const n: ChartNote = { t: 1, duration: 1, pitch: 60 };
  const flat = C4 * 2 ** (-70 / 1200);
  const frames: PitchFrame[] = [];
  for (let t = 0.95; t < 2.1; t += HOP)
    frames.push({ time: t, frequency: flat, clarity: 0.97, level: -25 });

  const grade = (d: 'easy' | 'normal' | 'strict') => {
    const j = new ContinuousJudge([n], applyDifficulty(base, d));
    for (const f of frames) j.feed(f);
    j.finish();
    return j.judgmentFor(0)!.grade;
  };

  it('misses when strict (60 cents), lands when normal or easy', () => {
    expect(grade('strict')).toBe('miss');
    expect(grade('normal')).not.toBe('miss');
    expect(grade('easy')).not.toBe('miss');
  });
});
