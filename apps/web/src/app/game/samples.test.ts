import { describe, expect, it } from 'vitest';
import { nearestPianoSample, PIANO_SAMPLES } from './samples';

describe('piano samples', () => {
  it('are one per fifth from C2 to G6, in order', () => {
    const midis = PIANO_SAMPLES.map((s) => s.midi);
    expect(midis).toEqual([...midis].sort((a, b) => a - b));
    expect(midis[0]).toBe(36);
    expect(midis.at(-1)).toBe(91);
  });

  it('offer nothing for a context that has not loaded any', () => {
    expect(nearestPianoSample({}, 60)).toBeUndefined();
  });
});
