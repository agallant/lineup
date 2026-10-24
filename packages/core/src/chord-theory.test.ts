import { describe, expect, it } from 'vitest';
import {
  CHORD_QUALITIES,
  allChordNames,
  canonicalChordName,
  chordPitchClasses,
  parseChordName,
} from './chord-theory';

describe('parseChordName', () => {
  it('reads roots, accidentals and qualities', () => {
    expect(parseChordName('C')).toMatchObject({ root: 0, bass: null });
    expect(parseChordName('F#m')).toMatchObject({ root: 6 });
    expect(parseChordName('Bb7')?.quality.id).toBe('7');
    expect(parseChordName('Dbmaj7')).toMatchObject({ root: 1 });
    expect(parseChordName('Asus4')?.quality.intervals).toEqual([0, 5, 7]);
    expect(parseChordName('E5')?.quality.id).toBe('5');
  });

  it('reads slash chords', () => {
    expect(parseChordName('G/B')).toMatchObject({ root: 7, bass: 11 });
    expect(parseChordName('D/F#')).toMatchObject({ root: 2, bass: 6 });
  });

  it('accepts other spellings of a quality', () => {
    expect(parseChordName('Cmin')?.quality.id).toBe('m');
    expect(parseChordName('CM7')?.quality.id).toBe('maj7');
    expect(parseChordName('Csus')?.quality.id).toBe('sus4');
    expect(parseChordName('C+')?.quality.id).toBe('aug');
    expect(parseChordName('Co')?.quality.id).toBe('dim');
  });

  it('rejects what is not a chord', () => {
    for (const bad of ['', 'H', 'Hm', 'Cfoo', 'c', 'C/', 'C/H', 'Am9x']) {
      expect(parseChordName(bad), bad).toBeNull();
    }
  });
});

describe('chord names', () => {
  it('canonical names use the games spelling', () => {
    expect(canonicalChordName('Db')).toBe('C#');
    expect(canonicalChordName('A#m')).toBe('Bbm');
    expect(canonicalChordName('Gb7')).toBe('F#7');
    expect(canonicalChordName('Cmin')).toBe('Cm');
    expect(canonicalChordName('Dbmaj7/Ab')).toBe('C#maj7/Ab');
    expect(canonicalChordName('nope')).toBeNull();
  });

  it('lists every root in every quality', () => {
    const names = allChordNames();
    expect(names).toHaveLength(12 * CHORD_QUALITIES.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => parseChordName(n) !== null)).toBe(true);
  });

  it('puts a slash chord bass first when it is not in the chord', () => {
    expect(chordPitchClasses(parseChordName('C/E')!)).toEqual([0, 4, 7]);
    expect(chordPitchClasses(parseChordName('C/D')!)).toEqual([2, 0, 4, 7]);
  });
});
