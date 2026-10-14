import { chartFromBeats, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { songMenuGroups, type MenuSong } from './song-menu';
import { DEFAULT_PICKER, defaultSongId, filterSongs, loadPicker, savePicker } from './song-picker';

class Mem {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

/** A quarter-note chart: faster means harder. */
const chart = (title: string, bpm: number): Chart =>
  chartFromBeats(
    { title, bpm },
    Array.from({ length: 16 }, (_, i) => ({ beat: i * 0.5 })),
  );
const song = (id: string, title: string, bpm: number): MenuSong => ({
  id,
  chart: chart(title, bpm),
  category: 'song',
});

const songs = [
  song('b', 'Banana Boat', 100),
  song('a', 'Apple Tree', 40),
  song('c', 'Cherry Row', 200),
  song('d', 'Date Palm', 60),
];
const order = (sort: Parameters<typeof songMenuGroups>[2], stars?: Record<string, number>) =>
  songMenuGroups(songs, (id) => stars?.[id] ?? null, sort)[0]!.items.map((i) => i.id);

describe('sorting', () => {
  it('easiest first is the default, hardest first reverses it', () => {
    expect(order('easy')).toEqual(['a', 'd', 'b', 'c']);
    expect(order('hard')).toEqual(['c', 'b', 'a', 'd']); // ties keep their order
  });
  it('A to Z orders by title', () => {
    expect(order('az')).toEqual(['a', 'b', 'c', 'd']);
  });
  it('best stars first, unplayed last', () => {
    expect(order('stars', { d: 3, b: 1 })).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('filterSongs', () => {
  const all = { ...DEFAULT_PICKER };
  it('lets everything through by default', () => {
    expect(filterSongs(songs, all)).toHaveLength(4);
  });
  it('searches the title in any case', () => {
    expect(filterSongs(songs, { ...all, query: ' ROW ' }).map((s) => s.id)).toEqual(['c']);
    expect(filterSongs(songs, { ...all, query: 'zzz' })).toEqual([]);
  });
  it('filters by difficulty band', () => {
    const rated = (band: 'easy' | 'medium' | 'hard') =>
      filterSongs(songs, { ...all, band }).map((s) => s.id);
    // every song falls in exactly one band
    const merged = [...rated('easy'), ...rated('medium'), ...rated('hard')].sort();
    expect(merged).toEqual(['a', 'b', 'c', 'd']);
    expect(rated('easy')).toContain('a');
    expect(rated('hard')).not.toContain('a');
  });
  it('hides songs cleared with three stars', () => {
    const stars = (id: string) => ({ a: 3, b: 2 })[id as 'a' | 'b'] ?? null;
    expect(filterSongs(songs, { ...all, hideCleared: true }, stars).map((s) => s.id)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });
});

describe('defaultSongId', () => {
  it('starts a new singer on the first step of the learning path', () => {
    expect(defaultSongId('voice', [{ id: 'singline-scale' }, { id: 'sing-hot-cross-buns' }])).toBe(
      'sing-hot-cross-buns',
    );
  });
  it('skips a step that is not on offer, and falls back to the first song', () => {
    expect(defaultSongId('voice', [{ id: 'sing-mary-lamb' }, { id: 'x' }])).toBe('sing-mary-lamb');
    expect(defaultSongId('voice', [{ id: 'x' }, { id: 'y' }])).toBe('x');
    expect(defaultSongId('voice', [])).toBeNull();
  });
  it('knows each game, and the sound set of a rhythm game', () => {
    expect(defaultSongId('keyboard', [{ id: 'keys-ex-five-finger' }, { id: 'z' }])).toBe(
      'keys-ex-five-finger',
    );
    expect(defaultSongId('bass', [{ id: 'z' }, { id: 'bass-ex-open-strings' }])).toBe(
      'bass-ex-open-strings',
    );
    expect(defaultSongId('clap', [{ id: 'clap-waltz' }, { id: 'ex-clap-quarters' }], 'clap')).toBe(
      'ex-clap-quarters',
    );
  });
});

describe('saved picker choices', () => {
  it('keeps the sort, band and hide-cleared, not the search', () => {
    const store = new Mem();
    savePicker(store, { query: 'x', sort: 'az', band: 'hard', hideCleared: true, random: true });
    expect(loadPicker(store)).toEqual({
      query: '',
      sort: 'az',
      band: 'hard',
      hideCleared: true,
      random: false,
    });
  });
  it('survives corrupt storage and a missing store', () => {
    const store = new Mem();
    store.setItem('lineup.songpicker.v1', '{nope');
    expect(loadPicker(store)).toEqual(DEFAULT_PICKER);
    store.setItem('lineup.songpicker.v1', JSON.stringify({ sort: 'sideways', band: 7 }));
    expect(loadPicker(store)).toEqual(DEFAULT_PICKER);
    expect(loadPicker(null)).toEqual(DEFAULT_PICKER);
    expect(() => savePicker(null, DEFAULT_PICKER)).not.toThrow();
  });
});
