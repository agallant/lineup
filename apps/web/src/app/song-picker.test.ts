import { chartFromBeats, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { songMenuGroups, type MenuSong } from './song-menu';
import {
  DEFAULT_PICKER,
  categoriesFor,
  categoriesOf,
  countText,
  defaultSongId,
  effectiveCategory,
  filterSongs,
  loadPicker,
  revealsAll,
  savePicker,
  LONG_LIST,
} from './song-picker';

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
    savePicker(store, {
      query: 'x',
      sort: 'az',
      band: 'hard',
      hideCleared: true,
      random: true,
      category: 'exercise',
    });
    expect(loadPicker(store)).toEqual({
      query: '',
      sort: 'az',
      band: 'hard',
      hideCleared: true,
      random: false,
      category: 'exercise',
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

describe('kinds of song', () => {
  /** A hard song has many fast notes; an easy one a few slow ones. */
  const mk = (id: string, title: string, category: MenuSong['category'], bpm = 60): MenuSong => ({
    id,
    chart:
      bpm > 150
        ? chartFromBeats(
            { title, bpm },
            Array.from({ length: 200 }, (_, i) => ({ beat: i * 0.25 })),
          )
        : chartFromBeats(
            { title, bpm },
            Array.from({ length: 4 }, (_, i) => ({ beat: i * 2 })),
          ),
    category,
  });
  const many = [
    mk('pop-beatles-test-tune', 'Test Tune', 'song', 220),
    mk('pop-someone-hit', 'Some Hit', 'song', 220),
    mk('ex-scale', 'C major scale', 'exercise'),
    mk('x-hot', 'Hot Cross Buns', 'song', 40),
    mk('x-rhythm', 'World rhythm: son clave', 'song', 40),
    mk('x-flute', 'Flute tune', 'flute', 40),
  ];

  it('puts each song in every kind it belongs to', () => {
    expect(categoriesOf(many[0]!)).toEqual(['all', 'hits', 'beatles']);
    expect(categoriesOf(many[2]!)).toEqual(['all', 'exercise']);
    expect(categoriesOf(many[3]!)).toEqual(['all', 'folk', 'beginner']);
    expect(categoriesOf(many[4]!)).toEqual(['all', 'world', 'beginner']);
    expect(categoriesOf(many[5]!)).toEqual(['all', 'flute']);
  });

  it('offers only kinds that have songs, with counts, in menu order', () => {
    expect(categoriesFor(many).map((c) => `${c.id}:${c.count}`)).toEqual([
      'beginner:2',
      'folk:1',
      'beatles:1',
      'hits:2',
      'world:1',
      'flute:1',
      'exercise:1',
      'all:6',
    ]);
  });

  it('starts a short menu on all songs and a long one on the first kind', () => {
    expect(effectiveCategory(many, '')).toBe('all');
    const long = Array.from({ length: 50 }, (_, i) => mk(`x${i}`, `Song ${i}`, 'song', 40));
    expect(effectiveCategory(long, '')).toBe('beginner');
    expect(effectiveCategory(long, 'folk')).toBe('folk');
    expect(effectiveCategory(long, 'exercise')).toBe('beginner'); // none here
  });

  it('shows only the chosen kind, but a search looks through all of them', () => {
    const only = (category: string, query = '') =>
      filterSongs(many, { ...DEFAULT_PICKER, category, query }).map((s) => s.id);
    expect(only('exercise')).toEqual(['ex-scale']);
    expect(only('beatles')).toEqual(['pop-beatles-test-tune']);
    expect(only('exercise', 'hot')).toEqual(['x-hot']);
  });

  it('shows every kind to offer a song asked for by name that the kind chosen hides', () => {
    const fill = (category: string, query = '', random = false) => ({
      songs: many,
      stars: () => null,
      random: [],
      state: { ...DEFAULT_PICKER, category, query, random },
    });
    // a folk song is hidden by the Exercises kind
    expect(revealsAll(fill('exercise'), 'x-hot')).toBe(true);
    // ...but not when it is shown anyway, unknown, searched for, or random songs are chosen
    expect(revealsAll(fill('folk'), 'x-hot')).toBe(false);
    expect(revealsAll(fill('exercise'), 'no-such-song')).toBe(false);
    expect(revealsAll(fill('exercise', 'hot'), 'x-hot')).toBe(false);
    expect(revealsAll(fill('exercise', '', true), 'x-hot')).toBe(false);
    // and a short menu already shows all
    expect(revealsAll(fill('all'), 'x-hot')).toBe(false);
    // a difficulty filter that hides it under every kind is no reason to leave this one
    const hard = { ...fill('folk'), state: { ...fill('folk').state, band: 'hard' as const } };
    expect(revealsAll(hard, 'x-hot')).toBe(false);
  });

  it('names the length at which a menu starts on its first kind', () => {
    const at = (n: number) =>
      Array.from({ length: n }, (_, i) => mk(`x${i}`, `Song ${i}`, 'song', 40));
    expect(effectiveCategory(at(LONG_LIST), '')).toBe('all');
    expect(effectiveCategory(at(LONG_LIST + 1), '')).toBe('beginner');
  });

  it('says how many songs are shown and of which kind', () => {
    const fill = (category: string, query = '', random = false) => ({
      songs: many,
      stars: () => null,
      random: [],
      state: { ...DEFAULT_PICKER, category, query, random },
    });
    expect(countText(fill('exercise'), 1)).toBe('1 song in Exercises and scales');
    expect(countText(fill('beginner'), 2)).toBe('2 songs in Beginner and easy songs');
    expect(countText(fill('all'), 6)).toBe('6 songs');
    expect(countText(fill('exercise', 'hot'), 3)).toBe('3 songs match your search');
    expect(countText(fill('folk'), 0)).toBe('No songs match: change the search or filters');
    expect(countText(fill('folk', '', true), 2)).toBe('');
  });

  it('puts the jazz, blues and classical progressions in their own kinds, not among the hits', () => {
    const mkPop = (id: string): MenuSong => ({ id, chart: chart(id, 100), category: 'song' });
    expect(categoriesOf(mkPop('pop-jazz-standard-joseph-kosma-autumn-leaves'))).toEqual([
      'all',
      'jazz',
      'beginner',
    ]);
    expect(categoriesOf(mkPop('pop-pachelbel-canon-in-d-the-ground-in-four-beat-bars'))).toContain(
      'classical',
    );
  });
});
