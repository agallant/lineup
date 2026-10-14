import { describe, expect, it } from 'vitest';
import { rateChart } from '../difficulty';
import { KEY_EXERCISES, KEY_PIECES, keysChart } from './keys';
import { builtinSongs, songCategory, songsFor } from './index';
import { KEY_TUNES } from './library';

const ALL = { ...KEY_TUNES, ...KEY_PIECES, ...KEY_EXERCISES };

describe('the keyboard library', () => {
  it('has tunes, pieces with both hands, chords and exercises, all for the keyboard', () => {
    expect(Object.keys(KEY_TUNES).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(KEY_PIECES).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(KEY_EXERCISES).length).toBeGreaterThanOrEqual(7);
    expect(songsFor('keyboard')).toHaveLength(Object.keys(ALL).length);
    for (const [id, chart] of Object.entries(ALL)) {
      expect(chart.meta.instruments, id).toEqual(['keyboard']);
      expect(id.startsWith('keys-'), id).toBe(true);
      expect(builtinSongs[id]).toBe(chart);
    }
  });

  it('stays within a 61-key keyboard (C2 to C7) and every note has a pitch', () => {
    for (const [id, chart] of Object.entries(ALL)) {
      for (const n of chart.notes) {
        expect(n.pitch, id).toBeDefined();
        expect(n.pitch!, id).toBeGreaterThanOrEqual(36);
        expect(n.pitch!, id).toBeLessThanOrEqual(96);
      }
    }
  });

  it('is rated and filed: exercises as exercises, the rest as songs', () => {
    for (const [id, chart] of Object.entries(ALL)) {
      const r = rateChart(chart);
      expect(r.score, id).toBeGreaterThanOrEqual(1);
      expect(r.score, id).toBeLessThanOrEqual(10);
      expect(songCategory(id), id).toBe(id.startsWith('keys-ex-') ? 'exercise' : 'song');
    }
  });

  it('writes both hands into one chart in time order, and chords as notes that start together', () => {
    const hands = keysChart({ title: 't', bpm: 100 }, 'E4:1 F4:1', 'C3:2');
    expect(hands.notes.map((n) => [n.t, n.pitch])).toEqual([
      [0, 48],
      [0, 64],
      [0.6, 65],
    ]);
    const chord = KEY_PIECES['keys-chords-c-f-g']!;
    const first = chord.notes.filter((n) => n.t === 0).map((n) => n.pitch);
    expect(first).toEqual([60, 64, 67]);
    for (let i = 1; i < chord.notes.length; i++) {
      expect(chord.notes[i]!.t).toBeGreaterThanOrEqual(chord.notes[i - 1]!.t);
    }
  });

  it('keeps a waltz in three', () => {
    expect(KEY_PIECES['keys-hands-g-waltz']!.meta.beatsPerBar).toBe(3);
  });
});
