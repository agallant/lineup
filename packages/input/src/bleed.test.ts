import type { PitchFrame } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { detectBleed } from './bleed';

const TONE = 523.25;
const frame = (frequency: number | null, level = -30): PitchFrame => ({
  time: 0,
  frequency,
  clarity: frequency === null ? 0.1 : 0.95,
  level,
});
const many = (n: number, f: () => PitchFrame) => Array.from({ length: n }, f);

describe('detectBleed', () => {
  it('flags a tone heard in every frame, with its mean level', () => {
    const r = detectBleed(
      many(50, () => frame(TONE, -28)),
      TONE,
    );
    expect(r).toEqual({ fraction: 1, meanLevelDb: -28, bleeding: true });
  });

  it('is not bleed when nothing is heard', () => {
    expect(
      detectBleed(
        many(50, () => frame(null, -80)),
        TONE,
      ),
    ).toEqual({ fraction: 0, meanLevelDb: null, bleeding: false });
  });

  it('threshold: 30% of frames is bleed, 29% is not (default)', () => {
    const at = (heard: number) => [
      ...many(heard, () => frame(TONE)),
      ...many(100 - heard, () => frame(null)),
    ];
    expect(detectBleed(at(30), TONE).bleeding).toBe(true);
    expect(detectBleed(at(29), TONE).bleeding).toBe(false);
  });

  it('threshold is configurable', () => {
    const frames = [...many(60, () => frame(TONE)), ...many(40, () => frame(null))];
    expect(detectBleed(frames, TONE, { threshold: 0.7 }).bleeding).toBe(false);
    expect(detectBleed(frames, TONE, { threshold: 0.5 }).bleeding).toBe(true);
  });

  it('counts the tone read an octave off (the tracker does this) but not a different note', () => {
    expect(
      detectBleed(
        many(20, () => frame(TONE / 2)),
        TONE,
      ).bleeding,
    ).toBe(true);
    expect(
      detectBleed(
        many(20, () => frame(TONE * 2)),
        TONE,
      ).bleeding,
    ).toBe(true);
    expect(
      detectBleed(
        many(20, () => frame(TONE * 2 ** (3 / 12))),
        TONE,
      ).bleeding,
    ).toBe(false);
  });

  it('tolerance: 40 cents off counts, 70 cents off does not (default 50)', () => {
    expect(
      detectBleed(
        many(20, () => frame(TONE * 2 ** (40 / 1200))),
        TONE,
      ).bleeding,
    ).toBe(true);
    expect(
      detectBleed(
        many(20, () => frame(TONE * 2 ** (70 / 1200))),
        TONE,
      ).bleeding,
    ).toBe(false);
    expect(
      detectBleed(
        many(20, () => frame(TONE * 2 ** (70 / 1200))),
        TONE,
        { toleranceCents: 100 },
      ).bleeding,
    ).toBe(true);
  });

  it('averages the level only over frames that heard the tone', () => {
    const frames = [frame(TONE, -20), frame(TONE, -40), frame(null, -90), frame(200, -10)];
    expect(detectBleed(frames, TONE).meanLevelDb).toBe(-30);
  });

  it('no frames at all is no bleed', () => {
    expect(detectBleed([], TONE)).toEqual({ fraction: 0, meanLevelDb: null, bleeding: false });
  });
});
