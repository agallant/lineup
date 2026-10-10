import { describe, expect, it } from 'vitest';
import { loadChart } from './chart';
import {
  WIND_INSTRUMENTS,
  checkFit,
  findWindInstrument,
  fingeringFor,
  holeGroups,
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
        .slice(0, 8)
        .map((n) => n.label),
    ).toEqual(['D5', 'E5', 'F#5', 'G5', 'A5', 'B5', 'C#6', 'D6']);
    expect(
      windScale(inst('whistle-c'))
        .slice(0, 7)
        .map((n) => n.label),
    ).toEqual(['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5']);
  });

  it('has no fingering for a note outside the scale (shown as "see your chart")', () => {
    expect(fingeringFor(d, 72)).toBeNull(); // C natural is a cross-fingering that varies by whistle
    expect(fingeringFor(d, 75)).toBeNull();
    expect(fingeringFor(d, 40)).toBeNull();
  });
});

describe('recorder fingerings (Baroque system)', () => {
  const s = inst('recorder-soprano');

  it('the C major scale from C5 to D6', () => {
    // thumb, holes 1-3, holes 4-7 (6 and 7 are the double holes)
    expect(windScale(s).map((n) => `${n.label} ${n.fingering.holes}`)).toEqual([
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
    expect(fingeringFor(alto, 68)).toBeNull(); // A-flat is not in F major
  });
});

describe('hole groups', () => {
  it('match the length of every fingering', () => {
    for (const i of WIND_INSTRUMENTS) {
      const total = holeGroups(i.family).reduce((a, b) => a + b, 0);
      for (const n of windScale(i)) expect(n.fingering.holes, i.id).toHaveLength(total);
    }
  });
  it('a family without a chart has no holes to draw', () => {
    expect(holeGroups('ocarina')).toEqual([]);
    expect(windScale(inst('ocarina-c12'))).toEqual([]);
    expect(fingeringFor(inst('ocarina-c12'), 72)).toBeNull();
  });
});

describe("moving a song into the instrument's key", () => {
  const [song] = songsFor('wind');
  const chart = song!.chart; // written in C, tonic C5

  it("uses the song's stated tonic", () => {
    expect(chart.meta.tonic).toBe(72);
    expect(shiftForInstrument(chart, inst('whistle-d'))).toBe(2);
    expect(shiftForInstrument(chart, inst('whistle-c'))).toBe(0);
    expect(shiftForInstrument(chart, inst('whistle-bb'))).toBe(-2);
    expect(shiftForInstrument(chart, inst('recorder-alto'))).toBe(-7);
    expect(shiftForInstrument(chart, inst('ocarina-c12'))).toBe(0);
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
    for (const { id, chart: c } of songsFor('wind')) {
      for (const i of WIND_INSTRUMENTS) {
        const shift = shiftForInstrument(c, i);
        const fit = checkFit(
          c.notes.map((n) => n.pitch! + shift),
          i,
        );
        expect(fit, `${id} on ${i.id}`).toEqual({ outOfRange: [], notInScale: [] });
      }
    }
  });
});

describe('checkFit', () => {
  it('names the notes that are too low or high, and the ones outside the scale', () => {
    const d = inst('whistle-d');
    expect(checkFit([74, 75, 60, 100, 76], d)).toEqual({ outOfRange: [60, 100], notInScale: [75] });
  });
  it("does not call an ocarina's chromatic notes out of scale", () => {
    expect(checkFit([70, 71, 72], inst('ocarina-c12'))).toEqual({ outOfRange: [], notInScale: [] });
  });
});
