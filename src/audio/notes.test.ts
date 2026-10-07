import { describe, expect, it } from 'vitest';
import { midiToFrequency, nearestOpenString, noteFromFrequency, UKULELE_GCEA } from './notes';

describe('notes', () => {
  it('maps the GCEA open strings to the right frequencies', () => {
    const hz = UKULELE_GCEA.map((s) => midiToFrequency(s.midi));
    expect(hz[0]).toBeCloseTo(391.995, 2); // G4
    expect(hz[1]).toBeCloseTo(261.626, 2); // C4
    expect(hz[2]).toBeCloseTo(329.628, 2); // E4
    expect(hz[3]).toBeCloseTo(440, 6); // A4
  });

  it('names notes and measures cents', () => {
    expect(noteFromFrequency(440)).toMatchObject({ label: 'A4', midi: 69 });
    expect(noteFromFrequency(440).cents).toBeCloseTo(0, 6);
    expect(noteFromFrequency(261.626).label).toBe('C4');
    expect(noteFromFrequency(466.164).label).toBe('A#4');
    const sharp = noteFromFrequency(440 * 2 ** (20 / 1200));
    expect(sharp.label).toBe('A4');
    expect(sharp.cents).toBeCloseTo(20, 6);
    const flat = noteFromFrequency(440 * 2 ** (-30 / 1200));
    expect(flat.cents).toBeCloseTo(-30, 6);
  });

  it('finds the nearest open string', () => {
    expect(nearestOpenString(392).string.label).toBe('G4');
    expect(nearestOpenString(259).string.label).toBe('C4');
    expect(nearestOpenString(259).cents).toBeLessThan(0);
  });
});
