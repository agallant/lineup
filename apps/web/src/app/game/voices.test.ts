import { describe, expect, it } from 'vitest';
import { LANE_DRUM, LANE_PITCH } from './backing';
import { canPlayVoices, VOICES } from './voices';

describe('voices', () => {
  it('are only played on a context that can synthesize', () => {
    expect(canPlayVoices({ currentTime: 0, createOscillator: () => ({}) })).toBe(false);
    const real = {
      currentTime: 0,
      sampleRate: 44100,
      createBuffer: () => ({}),
      createBufferSource: () => ({}),
      createBiquadFilter: () => ({}),
    };
    expect(canPlayVoices(real)).toBe(true);
    expect(canPlayVoices({ ...real, sampleRate: 0 })).toBe(false);
  });

  it('name every instrument once', () => {
    expect(new Set(VOICES).size).toBe(VOICES.length);
    expect(VOICES).toEqual(
      expect.arrayContaining([
        'pluck',
        'nylon',
        'piano',
        'bass',
        'organ',
        'flute',
        'pad',
        'mallet',
      ]),
    );
  });

  it('give every rhythm lane a drum and a fallback pitch', () => {
    for (const lane of Object.keys(LANE_PITCH)) expect(LANE_DRUM[lane]).toBeDefined();
  });
});
