import { describe, expect, it } from 'vitest';
import { loadChart } from './chart';
import {
  DEFAULT_WIND_INSTRUMENT,
  GENERIC_WIND_INSTRUMENT,
  WIND_INSTRUMENTS,
  checkFit,
  findWindInstrument,
  fingeringFor,
  holeGroups,
  inKey,
  isGenericWind,
  shiftForInstrument,
  windScale,
  type WindInstrument,
} from './wind-instruments';
import { songsFor } from './songs';

const inst = (id: string): WindInstrument => findWindInstrument(id)!;

describe('the instrument list', () => {
  it('has unique ids and sensible ranges', () => {
    const ids = WIND_INSTRUMENTS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of WIND_INSTRUMENTS) {
      expect(i.range.low, i.id).toBeLessThanOrEqual(i.tonic);
      expect(i.range.high, i.id).toBeGreaterThan(i.range.low);
      expect(i.range.low, i.id).toBeGreaterThanOrEqual(60); // the wind profile starts at C4
      expect(i.range.high, i.id).toBeLessThanOrEqual(96); // and ends at C7
    }
  });

  it('finds an instrument by id and says null for an unknown one', () => {
    expect(findWindInstrument('whistle-d')?.label).toBe('Tin whistle in D');
    expect(findWindInstrument('kazoo')).toBeNull();
    expect(findWindInstrument('constructor')).toBeNull();
  });
});

describe('tin whistle fingerings', () => {
  const d = inst('whistle-d');

  it('the first octave of a whistle in D', () => {
    // D5 E5 F#5 G5 A5 B5 C#6: the familiar closing of holes from the bottom up
    expect([74, 76, 78, 79, 81, 83, 85].map((m) => fingeringFor(d, m)!.holes)).toEqual([
      '111111',
      '111110',
      '111100',
      '111000',
      '110000',
      '100000',
      '000000',
    ]);
  });

  it('the second octave reuses them with a stronger breath, apart from the upper D', () => {
    expect(fingeringFor(d, 86)).toEqual({ holes: '011111', harder: true }); // D6
    expect(fingeringFor(d, 88)).toEqual({ holes: '111110', harder: true }); // E6
    expect(fingeringFor(d, 90)).toEqual({ holes: '111100', harder: true }); // F#6
    expect(fingeringFor(d, 74)!.harder).toBe(false);
  });

  it('the fingerings are the same whatever the key of the whistle', () => {
    const degrees = windScale(d).map((n) => n.fingering);
    for (const id of [
      'whistle-c',
      'whistle-bb',
      'whistle-a',
      'whistle-g',
      'whistle-f',
      'whistle-low-d',
    ]) {
      expect(
        windScale(inst(id)).map((n) => n.fingering),
        id,
      ).toEqual(degrees);
    }
  });

  it("labels the scale in the whistle's own key", () => {
    expect(
      windScale(d)
        .filter((n) => !n.chromatic)
        .slice(0, 8)
        .map((n) => n.label),
    ).toEqual(['D5', 'E5', 'F#5', 'G5', 'A5', 'B5', 'C#6', 'D6']);
    expect(
      windScale(inst('whistle-c'))
        .filter((n) => !n.chromatic)
        .slice(0, 7)
        .map((n) => n.label),
    ).toEqual(['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5']);
  });

  it('has fingerings for the notes between: half-holes and cross-fingerings', () => {
    expect(fingeringFor(d, 75)).toEqual({ holes: '111112', harder: false }); // E-flat: half hole
    expect(fingeringFor(d, 77)).toEqual({ holes: '111011', harder: false }); // F natural: cross
    expect(fingeringFor(d, 84)).toEqual({ holes: '011000', harder: false }); // C natural: cross
    expect(fingeringFor(d, 87)).toEqual({ holes: '111112', harder: true }); // upper E-flat
    // every semitone of two octaves has a fingering, the notes in between marked chromatic
    expect(windScale(d)).toHaveLength(24);
    expect(windScale(d).filter((n) => n.chromatic)).toHaveLength(10);
  });

  it('has no fingering below the tonic or above the top of its chart', () => {
    expect(fingeringFor(d, 73)).toBeNull();
    expect(fingeringFor(d, 40)).toBeNull();
    expect(fingeringFor(d, 98)).toBeNull();
  });
});

describe('recorder fingerings (Baroque system)', () => {
  const s = inst('recorder-soprano');

  it('the C major scale from C5 to D6', () => {
    // thumb, holes 1-3, holes 4-7 (6 and 7 are the double holes)
    const major = windScale(s).filter((n) => !n.chromatic);
    expect(major.map((n) => `${n.label} ${n.fingering.holes}`)).toEqual([
      'C5 11111111',
      'D5 11111110',
      'E5 11111100',
      'F5 11111011',
      'G5 11110000',
      'A5 11100000',
      'B5 11000000',
      'C6 10100000',
      'D6 00100000',
    ]);
  });

  it('an alto recorder in F uses the same fingerings a fourth lower', () => {
    const alto = inst('recorder-alto');
    expect(windScale(alto).map((n) => n.fingering)).toEqual(windScale(s).map((n) => n.fingering));
    expect(fingeringFor(alto, 65)!.holes).toBe('11111111'); // F4
    expect(fingeringFor(alto, 68)).toEqual(fingeringFor(s, 75)); // A-flat: the same fork as E-flat
  });

  it('has the commonly taught chromatic fingerings, with the half-holes marked', () => {
    expect(fingeringFor(s, 73)!.holes).toBe('11111112'); // C#: bottom hole half covered
    expect(fingeringFor(s, 78)!.holes).toBe('11110110'); // F#: hole 4 open
    expect(fingeringFor(s, 80)!.holes).toBe('11101111'); // G#: hole 3 open
    expect(fingeringFor(s, 82)!.holes).toBe('11011000'); // B-flat: hole 2 open
    expect(fingeringFor(s, 85)).toBeNull(); // the C# above the upper D is left to the maker's chart
    expect(windScale(s).filter((n) => n.chromatic)).toHaveLength(5);
  });
});

describe('hole groups', () => {
  it('match the length of every fingering', () => {
    for (const i of WIND_INSTRUMENTS) {
      const total = holeGroups(i.family).reduce((a, b) => a + b, 0);
      for (const n of windScale(i)) expect(n.fingering.holes, i.id).toHaveLength(total);
    }
  });
  it('every specific instrument offered has a fingering chart; the generic one has none', () => {
    for (const i of WIND_INSTRUMENTS) expect(windScale(i).length > 0, i.id).toBe(!isGenericWind(i));
    expect(holeGroups('generic')).toEqual([]);
    expect(fingeringFor(GENERIC_WIND_INSTRUMENT, 72)).toBeNull();
  });
});

describe("moving a song into the instrument's key", () => {
  const [song] = songsFor('wind');
  const chart = song!.chart; // written in C, tonic C5 (the first song, not an exercise)

  it("uses the song's stated tonic", () => {
    expect(chart.meta.tonic).toBe(72);
    expect(shiftForInstrument(chart, inst('whistle-d'))).toBe(2);
    expect(shiftForInstrument(chart, inst('whistle-c'))).toBe(0);
    expect(shiftForInstrument(chart, inst('whistle-bb'))).toBe(-2);
    expect(shiftForInstrument(chart, inst('recorder-alto'))).toBe(-7);
    expect(shiftForInstrument(chart, inst('generic'))).toBe(0);
  });

  it('leaves a song with no stated key where it is', () => {
    const r = loadChart({
      version: 1,
      meta: { title: 't', bpm: 100 },
      notes: [{ t: 0, pitch: 70 }],
    });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(shiftForInstrument(r.value, inst('whistle-d'))).toBe(0);
  });

  it('every built-in wind song fits every instrument once moved into its key', () => {
    for (const { id, chart: c } of songsFor('wind').filter((s) => s.category === 'song')) {
      for (const i of WIND_INSTRUMENTS) {
        const shift = shiftForInstrument(c, i);
        const fit = checkFit(
          c.notes.map((n) => n.pitch! + shift),
          i,
        );
        // Greensleeves spans more than a recorder's range; everything else fits everything
        const tooWide = id === 'wind-greensleeves' && i.family === 'recorder';
        if (!tooWide) expect(fit.outOfRange, `${id} on ${i.id}`).toEqual([]);
        expect(fit.noFingering, `${id} on ${i.id}`).toEqual([]);
      }
    }
  });
});

describe('checkFit', () => {
  it('names the notes that are too low or high, and the ones with no fingering', () => {
    const d = inst('whistle-d');
    expect(checkFit([74, 75, 60, 100, 76], d)).toEqual({ outOfRange: [60, 100], noFingering: [] });
    expect(checkFit([72, 85, 86], inst('recorder-soprano'))).toEqual({
      outOfRange: [],
      noFingering: [85],
    });
  });
});

describe('the generic instrument', () => {
  it('is the default, in C, and first in the list', () => {
    expect(DEFAULT_WIND_INSTRUMENT).toBe('generic');
    expect(WIND_INSTRUMENTS[0]).toBe(GENERIC_WIND_INSTRUMENT);
    expect(GENERIC_WIND_INSTRUMENT.tonic).toBe(72);
    expect(isGenericWind(inst('generic'))).toBe(true);
    expect(isGenericWind(inst('whistle-d'))).toBe(false);
  });

  it('set to a key moves its tonic and range, and has no fingering chart', () => {
    const d = inKey(GENERIC_WIND_INSTRUMENT, 2);
    expect(d.tonic).toBe(74); // C5 + 2 = D5
    expect(d.range).toEqual(inst('whistle-d').range);
    expect(windScale(d)).toEqual([]);
  });

  it('checks only the range: any note in it is fine, whatever its scale', () => {
    const d = inKey(GENERIC_WIND_INSTRUMENT, 2);
    expect(checkFit([74, 75, 76, 97, 60], d)).toEqual({ outOfRange: [60, 97], noFingering: [] });
  });

  it('keeps the top of its range at the highest note the pitch tracker handles', () => {
    expect(inKey(GENERIC_WIND_INSTRUMENT, 12).range.high).toBe(96);
  });
});
