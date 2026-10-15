import { describe, expect, it } from 'vitest';
import { loadChart } from './chart';
import {
  DEFAULT_WIND_INSTRUMENT,
  GENERIC_WIND_INSTRUMENT,
  WIND_INSTRUMENTS,
  bestOctaveShift,
  checkFit,
  findWindInstrument,
  fingeringFor,
  holeGroups,
  inKey,
  instrumentRoot,
  isGenericWind,
  isPentatonicFamily,
  isPentatonicSong,
  registerShift,
  shiftForInstrument,
  windScale,
  type WindInstrument,
} from './wind-instruments';
import { getSong, songsFor } from './songs';

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
    expect(fingeringFor(s, 85)!.holes).toBe('10110000'); // upper C#: thumb, holes 2 and 3
    expect(fingeringFor(s, 87)).toBeNull(); // above the upper D is left to the maker's chart
    expect(windScale(s).filter((n) => n.chromatic)).toHaveLength(6);
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
      // the pentatonic flutes have their own songs (below): a diatonic tune has notes they lack
      for (const i of WIND_INSTRUMENTS.filter((i) => !isPentatonicFamily(i.family))) {
        const shift = shiftForInstrument(c, i);
        const fit = checkFit(
          c.notes.map((n) => n.pitch! + shift),
          i,
        );
        // these span more than a recorder's range; everything else fits everything
        const tooWide =
          ['wind-greensleeves', 'wind-silent-night', 'wind-fur-elise'].includes(id) &&
          i.family === 'recorder';
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
      noFingering: [],
    });
    // a chart with a gap in it: the fingering is missing, not the range
    const wide = { ...inst('recorder-soprano'), range: { low: 72, high: 90 } };
    expect(checkFit([87, 91], wide)).toEqual({ outOfRange: [91], noFingering: [87] });
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

describe('bestOctaveShift', () => {
  const range = { low: 74, high: 97 }; // a D whistle

  it('leaves a song that fits where it is', () => {
    expect(bestOctaveShift({ low: 76, high: 88 }, range)).toBe(0);
  });

  it('moves a song that sits an octave low or high up or down to fit', () => {
    expect(bestOctaveShift({ low: 64, high: 76 }, range)).toBe(12);
    expect(bestOctaveShift({ low: 88, high: 100 }, range)).toBe(-12);
    expect(bestOctaveShift({ low: 52, high: 64 }, range)).toBe(24);
  });

  it('takes the smallest move when two fit equally, and the best compromise for a song too wide', () => {
    expect(bestOctaveShift({ low: 80, high: 84 }, range)).toBe(0);
    // 40 semitones wide in a 23-semitone range: no octave fits; the least overhang wins
    const move = bestOctaveShift({ low: 60, high: 100 }, range);
    expect(Math.abs(move)).toBeLessThanOrEqual(12);
  });
});

describe('the pentatonic flutes', () => {
  const naf = inst('naf-a');
  const shaku = inst('shaku-18');

  it('are listed under their own heading, with their lowest note below the major tonic', () => {
    const flutes = WIND_INSTRUMENTS.filter((i) => isPentatonicFamily(i.family));
    expect(flutes.length).toBeGreaterThanOrEqual(8);
    for (const i of flutes) {
      expect(i.group, i.id).toBe('Pentatonic flutes');
      expect(instrumentRoot(i), i.id).toBe(i.tonic - 3);
      expect(i.range.low, i.id).toBe(instrumentRoot(i));
    }
    expect(
      WIND_INSTRUMENTS.filter((i) => !isPentatonicFamily(i.family)).every((i) => !i.group),
    ).toBe(true);
    expect(instrumentRoot(inst('whistle-d'))).toBe(74);
  });

  it('a six-hole Native American flute opens one more hole at a time, bottom first', () => {
    // A4 C5 D5 E5 G5 A5 C6: root, minor third, fourth, fifth, minor seventh, octave, minor tenth
    expect([69, 72, 74, 76, 79, 81, 84].map((m) => fingeringFor(naf, m)!.holes)).toEqual([
      '111111',
      '111110',
      '111100',
      '111000',
      '110000',
      '100000',
      '000000',
    ]);
    // the upper register repeats the fingerings with a stronger breath
    expect(fingeringFor(naf, 86)).toEqual({ holes: '111100', harder: true }); // D6
    expect(fingeringFor(naf, 93)).toEqual({ holes: '100000', harder: true }); // A6
    // a note outside the scale has no fingering, and neither does one below the lowest note
    expect(fingeringFor(naf, 77)).toBeNull();
    expect(fingeringFor(naf, 68)).toBeNull();
    expect(holeGroups('native-flute')).toEqual([3, 3]);
  });

  it('has a scale with no sharps or flats to learn, and the same steps in every key', () => {
    expect(windScale(naf).every((n) => !n.chromatic)).toBe(true);
    const g = inst('naf-g');
    expect(windScale(g).map((n) => n.midi - instrumentRoot(g))).toEqual(
      windScale(naf).map((n) => n.midi - instrumentRoot(naf)),
    );
  });

  it('a shakuhachi names its notes Ro Tsu Re Chi Ri and draws no holes', () => {
    // D4 F4 G4 A4 C5 D5: the 1.8 shakuhachi in D
    expect([62, 65, 67, 69, 72, 74].map((m) => fingeringFor(shaku, m)!.name)).toEqual([
      'Ro',
      'Tsu',
      'Re',
      'Chi',
      'Ri',
      'Ro↑',
    ]);
    expect(fingeringFor(shaku, 62)!.holes).toBe('');
    expect(fingeringFor(shaku, 74)!.harder).toBe(true); // the second octave takes more breath
    expect(holeGroups('shakuhachi')).toEqual([]);
  });

  it('place a song in the lowest register that fits, or the best fit when it is too wide', () => {
    const range = { low: 69, high: 93 };
    expect(registerShift({ low: 81, high: 93 }, range)).toBe(-12);
    expect(registerShift({ low: 69, high: 84 }, range)).toBe(0);
    expect(registerShift({ low: 57, high: 69 }, range)).toBe(12);
    expect(registerShift({ low: 60, high: 100 }, range) % 12).toBe(0);
  });

  it('shift a song written in C (the major tonic) onto the flute in its own key', () => {
    const c = songsFor('wind').find((s) => s.id === 'flute-first-breath')!.chart;
    for (const i of WIND_INSTRUMENTS.filter((i) => isPentatonicFamily(i.family))) {
      const shift =
        shiftForInstrument(c, i) +
        registerShift(
          {
            low: Math.min(...c.notes.map((n) => n.pitch! + shiftForInstrument(c, i))),
            high: Math.max(...c.notes.map((n) => n.pitch! + shiftForInstrument(c, i))),
          },
          i.range,
        );
      const fit = checkFit(
        c.notes.map((n) => n.pitch! + shift),
        i,
      );
      expect(fit, i.id).toEqual({ outOfRange: [], noFingering: [] });
      // the song comes home on the flute's lowest note
      expect(c.notes.at(-1)!.pitch! + shift, i.id).toBe(instrumentRoot(i));
    }
  });
});

describe('isPentatonicSong', () => {
  const song = (tonic: number | undefined, pitches: number[]) => ({
    meta: { title: 't', bpm: 60, countInBeats: 0, ...(tonic === undefined ? {} : { tonic }) },
    notes: pitches.map((pitch, i) => ({ t: i, duration: 1, pitch })),
  });

  it('is true when every note is one of the five (do re mi sol la), in either mood', () => {
    expect(isPentatonicSong(song(60, [60, 62, 64, 67, 69, 72, 48]) as never)).toBe(true);
    expect(isPentatonicSong(song(67, [67, 69, 71, 74, 76]) as never)).toBe(true);
  });

  it('is false for a fourth or seventh, a chromatic note, no notes, or no tonic', () => {
    expect(isPentatonicSong(song(60, [60, 62, 65]) as never)).toBe(false); // F is the fourth
    expect(isPentatonicSong(song(60, [60, 62, 71]) as never)).toBe(false); // B is the seventh
    expect(isPentatonicSong(song(60, [60, 61]) as never)).toBe(false);
    expect(isPentatonicSong(song(60, []) as never)).toBe(false);
    expect(isPentatonicSong(song(undefined, [60, 62]) as never)).toBe(false);
  });

  it('sorts the library: the flute songs all qualify, and Ode to Joy does not', () => {
    for (const s of songsFor('wind').filter((x) => x.category === 'flute')) {
      expect(isPentatonicSong(s.chart), s.id).toBe(true);
    }
    expect(isPentatonicSong(getSong('wind-ode-to-joy'))).toBe(false);
  });
});
