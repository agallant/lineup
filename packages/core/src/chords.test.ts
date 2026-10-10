import { describe, expect, it } from 'vitest';
import { chartChords, chordMidis, chordShapesFor, UKULELE_CHORD_FRETS } from './chords';
import { getProfile } from './profiles';
import { getSong } from './songs';

const uke = getProfile('ukulele-strum');

describe('chordMidis', () => {
  it('turns frets into the notes the four strings sound', () => {
    expect(chordMidis(uke, 'C')).toEqual([67, 60, 64, 72]); // G C E C
    expect(chordMidis(uke, 'Am')).toEqual([69, 60, 64, 69]); // A C E A
    expect(chordMidis(uke, 'G7')).toEqual([67, 62, 65, 71]);
  });

  it('is null for a chord with no fingering, a profile with no strings and inherited names', () => {
    expect(chordMidis(uke, 'Xmaj13')).toBeNull();
    expect(chordMidis(uke, 'constructor')).toBeNull();
    expect(chordMidis(getProfile('voice'), 'C')).toBeNull();
  });

  it('every fingering has one fret per string', () => {
    for (const [name, frets] of Object.entries(UKULELE_CHORD_FRETS)) {
      expect(frets, name).toHaveLength(uke.tuning!.strings.length);
      expect(chordMidis(uke, name), name).not.toBeNull();
    }
  });
});

describe('chartChords / chordShapesFor', () => {
  it('lists the distinct chords of a song in order', () => {
    expect(chartChords(getSong('strum-four-chords'))).toEqual(['C', 'Am', 'F', 'G']);
    expect(chartChords(getSong('strum-folk'))).toEqual(['G', 'C', 'D']);
    expect(chartChords(getSong('singline-scale'))).toEqual([]);
  });

  it('builds recognizer shapes for them', () => {
    const shapes = chordShapesFor(uke, chartChords(getSong('strum-four-chords')));
    expect(Object.keys(shapes)).toEqual(['C', 'Am', 'F', 'G']);
    expect(shapes['F']).toEqual([69, 60, 65, 69]);
  });

  it('fails loudly on a chord the instrument has no fingering for', () => {
    expect(() => chordShapesFor(uke, ['C', 'Zm'])).toThrow(/no fingering for chord "Zm"/);
  });

  it('every built-in strum song only uses chords with a fingering', () => {
    for (const id of ['ukulele-strum-demo', 'strum-four-chords', 'strum-folk']) {
      expect(() => chordShapesFor(uke, chartChords(getSong(id))), id).not.toThrow();
    }
  });
});
