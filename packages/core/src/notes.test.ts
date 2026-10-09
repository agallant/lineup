import { describe, expect, it } from 'vitest';
import {
  deviationCents,
  midiToFrequency,
  nearestOpenString,
  noteFromFrequency,
  UKULELE_GCEA,
} from './notes';

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

describe('deviationCents', () => {
  const c4 = midiToFrequency(60);
  it.each([
    [c4, 0],
    [c4 * 2 ** (30 / 1200), 30],
    [c4 * 2 ** (-45 / 1200), -45],
    [c4 * 2, 1200],
    [c4 / 2, -1200],
  ])('%d Hz is %d cents from C4', (hz, cents) => {
    expect(deviationCents(hz, 60)).toBeCloseTo(cents, 6);
  });

  it('octave-forgiving folds to the nearest octave', () => {
    expect(deviationCents(c4 * 2, 60, true)).toBeCloseTo(0, 6);
    expect(deviationCents(c4 / 2, 60, true)).toBeCloseTo(0, 6);
    expect(deviationCents(c4 * 4 * 2 ** (20 / 1200), 60, true)).toBeCloseTo(20, 6);
    expect(deviationCents((c4 / 2) * 2 ** (-35 / 1200), 60, true)).toBeCloseTo(-35, 6);
    // a different pitch class stays different
    expect(deviationCents(midiToFrequency(62) * 2, 60, true)).toBeCloseTo(200, 6);
  });
});
