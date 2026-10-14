import { describe, expect, it } from 'vitest';
import { VOICE_RANGES, isVoiceChoice, voiceFit, voiceFitText } from './voice-range';

describe('voice range', () => {
  it('knows the voice types and nothing else', () => {
    expect(VOICE_RANGES.map((v) => v.id)).toEqual(['bass', 'baritone', 'tenor', 'alto', 'soprano']);
    expect(isVoiceChoice('any')).toBe(true);
    expect(isVoiceChoice('tenor')).toBe(true);
    expect(isVoiceChoice('castrato')).toBe(false);
    expect(isVoiceChoice(3)).toBe(false);
    expect(voiceFit({ low: 60, high: 72 }, 'any')).toBeNull();
  });

  it('leaves a song that sits well, and moves one that does not by whole octaves', () => {
    expect(voiceFit({ low: 55, high: 67 }, 'tenor')).toEqual({
      octave: 0,
      fits: true,
      tooWide: false,
    });
    // an octave too high for a bass
    const high = voiceFit({ low: 64, high: 76 }, 'bass')!;
    expect(high.octave).toBe(-12);
    expect(high.fits).toBe(true);
    // an octave too low for a soprano
    const low = voiceFit({ low: 48, high: 60 }, 'soprano')!;
    expect(low.octave).toBe(12);
    expect(low.fits).toBe(true);
    expect(Math.abs(high.octave % 12)).toBe(0);
  });

  it('says when a song is wider than the voice', () => {
    const wide = voiceFit({ low: 45, high: 84 }, 'tenor')!;
    expect(wide.tooWide).toBe(true);
    expect(wide.fits).toBe(false);
  });

  it('puts the fit into a sentence', () => {
    expect(voiceFitText({ octave: 0, fits: true, tooWide: false }, 'tenor')).toMatch(/Sits well/);
    expect(voiceFitText({ octave: -12, fits: true, tooWide: false }, 'bass')).toMatch(
      /an octave lower/,
    );
    expect(voiceFitText({ octave: 12, fits: true, tooWide: false }, 'alto')).toMatch(
      /an octave higher/,
    );
    expect(voiceFitText({ octave: 0, fits: false, tooWide: true }, 'tenor')).toMatch(/wider/);
    expect(voiceFitText({ octave: -24, fits: false, tooWide: false }, 'bass')).toMatch(
      /2 octaves lower/,
    );
  });
});
