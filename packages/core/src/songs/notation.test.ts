import { describe, expect, it } from 'vitest';
import { LIBRARY } from './library';
import {
  grooveChart,
  melodyChart,
  melodyNotes,
  parseNoteName,
  pickedMelodyChart,
  strumChart,
  ukulelePluck,
} from './notation';

const meta = { title: 't', bpm: 60 };

describe('parseNoteName', () => {
  it('reads names with sharps, flats and octaves', () => {
    expect(parseNoteName('C4')).toBe(60);
    expect(parseNoteName('A4')).toBe(69);
    expect(parseNoteName('F#4')).toBe(66);
    expect(parseNoteName('Bb3')).toBe(58);
    expect(parseNoteName('G3')).toBe(55);
  });
  it('rejects things that are not notes', () => {
    for (const bad of ['H4', 'C', 'c4', 'C##4', '', 'r'])
      expect(() => parseNoteName(bad)).toThrow();
  });
});

describe('melodyNotes', () => {
  it('places notes in beats with rests, fractions and bar lines', () => {
    const notes = melodyNotes('C4 | D4:2 r:1 E4:1/2 F4:.5');
    expect(notes.map((n) => n.beat)).toEqual([0, 1, 4, 4.5]);
    expect(notes.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
    expect(notes[1]!.beats).toBeCloseTo(2 * 0.88);
  });
  it('transposes', () => {
    expect(melodyNotes('C4', 12)[0]!.pitch).toBe(72);
  });
  it('rejects empty melodies and bad lengths', () => {
    expect(() => melodyNotes('r:4')).toThrow(/at least one note/);
    expect(() => melodyNotes('C4:0')).toThrow(/bad length/);
    expect(() => melodyNotes('C4:x')).toThrow(/bad length/);
  });
  it('makes a valid chart whose repeated notes are separated', () => {
    const c = melodyChart(meta, 'C4 C4 C4');
    expect(c.notes).toHaveLength(3);
    expect(c.notes[1]!.t).toBeGreaterThan(c.notes[0]!.t + c.notes[0]!.duration);
  });
});

describe('ukulelePluck', () => {
  it('finds the lowest fret on one string', () => {
    expect(ukulelePluck(60)).toEqual([null, 0, null, null]); // C string open
    expect(ukulelePluck(64)).toEqual([null, null, 0, null]); // E string open
    expect(ukulelePluck(62)).toEqual([null, 2, null, null]);
    expect(ukulelePluck(72)).toEqual([null, null, null, 3]); // A string, fret 3
  });
  it('refuses a note it cannot reach', () => {
    expect(() => ukulelePluck(50)).toThrow();
    expect(() => ukulelePluck(90)).toThrow();
  });
  it('a picked melody names the string to pluck and no chord', () => {
    const c = pickedMelodyChart(meta, 'C4 E4');
    expect(c.notes.map((n) => n.expected?.frets)).toEqual([
      [null, 0, null, null],
      [null, null, 0, null],
    ]);
    expect(c.notes.every((n) => n.expected?.chord === undefined)).toBe(true);
  });
});

describe('strumChart', () => {
  it('writes a chord per bar with the pattern on an eighth-note grid', () => {
    const c = strumChart(meta, 'C | G7', 'D . D U . . . .');
    expect(c.notes.map((n) => [n.t, n.expected?.chord, n.expected?.direction])).toEqual([
      [0, 'C', 'down'],
      [1, 'C', 'down'],
      [1.5, 'C', 'up'],
      [4, 'G7', 'down'],
      [5, 'G7', 'down'],
      [5.5, 'G7', 'up'],
    ]);
  });
  it('rejects a pattern of the wrong length, an unknown chord and a bad step', () => {
    expect(() => strumChart(meta, 'C', 'D . D')).toThrow(/needs 8 steps/);
    expect(() => strumChart(meta, 'H', 'D . D U . U D U')).toThrow(/no ukulele fingering/);
    expect(() => strumChart(meta, 'C', 'D . D U . U D X')).toThrow(/bad strum step/);
    expect(strumChart(meta, 'C', 'D . D U D U', { beatsPerBar: 3 }).notes).toHaveLength(5);
  });
});

describe('grooveChart', () => {
  it('writes a hit per x on the grid, lane by lane, in time order', () => {
    const c = grooveChart(meta, { kick: 'x... | x...', hat: '.x.x | .x.x' });
    expect(c.notes.map((n) => [n.t, n.lane])).toEqual([
      [0, 'kick'],
      [0.5, 'hat'],
      [1.5, 'hat'],
      [2, 'kick'],
      [2.5, 'hat'],
      [3.5, 'hat'],
    ]);
  });
  it('rejects lanes of different lengths and unknown steps', () => {
    expect(() => grooveChart(meta, { a: 'x...', b: 'x..' })).toThrow(/expected 4/);
    expect(() => grooveChart(meta, { a: 'x?..' })).toThrow(/bad groove step/);
  });
  it('rejects two lanes hitting on the same step (one sound at a time)', () => {
    expect(() => grooveChart(meta, { kick: 'x...', hat: 'x...' })).toThrow(/both hit/);
  });
});

describe('the library', () => {
  it('has unique ids with the prefix each mode expects', () => {
    const ids = Object.keys(LIBRARY);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^(sing|wind|strum|pick|clap|hand|kit)-/);
    }
  });
  it('names the profile each song is for, and one only', () => {
    for (const [id, chart] of Object.entries(LIBRARY)) {
      expect(chart.meta.instruments, id).toHaveLength(1);
    }
  });
  it('wind songs never go below their tonic (a whistle or recorder cannot play there)', () => {
    for (const [id, chart] of Object.entries(LIBRARY)) {
      if (!id.startsWith('wind-')) continue;
      expect(Math.min(...chart.notes.map((n) => n.pitch!)), id).toBeGreaterThanOrEqual(
        chart.meta.tonic!,
      );
    }
  });
  it('voice songs sit in a comfortable range', () => {
    for (const [id, chart] of Object.entries(LIBRARY)) {
      if (!id.startsWith('sing-')) continue;
      const pitches = chart.notes.map((n) => n.pitch!);
      expect(Math.min(...pitches), id).toBeGreaterThanOrEqual(55); // G3
      expect(Math.max(...pitches), id).toBeLessThanOrEqual(79); // G5
    }
  });
});
