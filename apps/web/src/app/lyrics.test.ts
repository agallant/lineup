import { chartFromBeats } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { lyricIndexAt, lyricWindow, syllables } from './lyrics';

const chart = chartFromBeats({ title: 't', bpm: 60, instruments: ['voice'] }, [
  { beat: 0, beats: 1, pitch: 60 },
  { beat: 1, beats: 1, pitch: 62 },
  { beat: 2, beats: 1, pitch: 64 },
]);

describe('lyrics', () => {
  it('splits the words into syllables', () => {
    expect(syllables(' Twin  kle\ntwin ')).toEqual(['Twin', 'kle', 'twin']);
    expect(syllables('')).toEqual([]);
  });

  it('follows the notes, a little ahead of each', () => {
    expect(lyricIndexAt(chart, -3)).toBe(-1);
    const first = chart.notes[0]!.t;
    expect(lyricIndexAt(chart, first - 1)).toBe(-1);
    expect(lyricIndexAt(chart, first)).toBe(0);
    expect(lyricIndexAt(chart, chart.notes[1]!.t - 0.1)).toBe(1);
    expect(lyricIndexAt(chart, 99)).toBe(2);
  });

  it('shows the words around the current one, and copes with too few words', () => {
    const w = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    expect(lyricWindow(w, 3)).toEqual({ before: 'a b c', current: 'd', after: 'e f g' });
    expect(lyricWindow(w, 0, 2)).toEqual({ before: '', current: 'a', after: 'b c' });
    expect(lyricWindow(['x'], 4)).toEqual({ before: '', current: 'x', after: '' });
    expect(lyricWindow(w, -1, 2)).toEqual({ before: '', current: '', after: 'a b c' });
    expect(lyricWindow([], 0)).toEqual({ before: '', current: '', after: '' });
  });
});
