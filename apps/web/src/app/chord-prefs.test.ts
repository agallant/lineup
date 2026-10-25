import { chordFrets, setChordPreferences } from '@lineup/core';
import { afterEach, describe, expect, it } from 'vitest';
import { applyStoredChordPrefs, chooseFingering, loadChordPrefs } from './chord-prefs';

class Memory implements Pick<Storage, 'getItem' | 'setItem'> {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

afterEach(() => {
  setChordPreferences({});
  applyStoredChordPrefs(null);
});

describe('chosen chord fingerings', () => {
  it('replace the default for that chord and instrument only, until forgotten', () => {
    const store = new Memory();
    const easiest = chordFrets(undefined, 'Bm');
    chooseFingering('ukulele', 'Bm', [9, 7, 7, 7], store);
    expect(chordFrets(undefined, 'Bm')).toEqual([9, 7, 7, 7]);
    expect(chordFrets(undefined, 'Cm')).not.toEqual([9, 7, 7, 7]);
    expect(chordFrets('guitar-strum', 'Bm')).toEqual([null, 2, 4, 4, 3, 2]);
    // another spelling of the same chord
    chooseFingering('ukulele', 'Db', [1, 1, 1, 4], store);
    expect(chordFrets(undefined, 'C#')).toEqual([1, 1, 1, 4]);
    chooseFingering('ukulele', 'Bm', null, store);
    expect(chordFrets(undefined, 'Bm')).toEqual(easiest);
  });

  it('are kept on the device and put to use when the app starts', () => {
    const store = new Memory();
    chooseFingering('guitar', 'F', [null, null, 3, 2, 1, 1], store);
    setChordPreferences({});
    expect(chordFrets('guitar-strum', 'F')).not.toEqual([null, null, 3, 2, 1, 1]);
    applyStoredChordPrefs(store);
    expect(chordFrets('guitar-strum', 'F')).toEqual([null, null, 3, 2, 1, 1]);
    // a guitar in another tuning is not affected: the shape is for standard tuning
    expect(chordFrets('guitar-strum-dropd', 'F')).not.toEqual([null, null, 3, 2, 1, 1]);
  });

  it('keep earlier choices of the visit when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    chooseFingering('ukulele', 'Bm', [9, 7, 7, 7], blocked);
    chooseFingering('ukulele', 'Cm', [5, 3, 3, 3], blocked);
    expect(chordFrets(undefined, 'Bm')).toEqual([9, 7, 7, 7]);
    expect(chordFrets(undefined, 'Cm')).toEqual([5, 3, 3, 3]);
  });

  it('keep earlier choices of the visit when only writes fail', () => {
    const readOnly = {
      getItem: () => JSON.stringify({ ukulele: { Dm: [2, 2, 1, 0] }, guitar: {} }),
      setItem: () => {
        throw new Error('full');
      },
    };
    chooseFingering('ukulele', 'Bm', [9, 7, 7, 7], readOnly);
    chooseFingering('ukulele', 'Cm', [5, 3, 3, 3], readOnly);
    expect(chordFrets(undefined, 'Bm')).toEqual([9, 7, 7, 7]);
    expect(chordFrets(undefined, 'Cm')).toEqual([5, 3, 3, 3]);
  });

  it('keep a forgotten chord forgotten when the store will not write', () => {
    const readOnly = {
      getItem: () =>
        JSON.stringify({ ukulele: { Bm: [9, 7, 7, 7], Dm: [2, 2, 1, 0] }, guitar: {} }),
      setItem: () => {
        throw new Error('full');
      },
    };
    chooseFingering('ukulele', 'Bm', null, readOnly);
    chooseFingering('ukulele', 'Cm', [5, 3, 3, 3], readOnly);
    expect(chordFrets(undefined, 'Bm')).not.toEqual([9, 7, 7, 7]);
    expect(chordFrets(undefined, 'Dm')).toEqual([2, 2, 1, 0]);
  });

  it('ignore damaged or wrongly shaped entries', () => {
    const store = new Memory();
    store.setItem(
      'lineup.chordprefs.v1',
      JSON.stringify({
        ukulele: { C: [1, 2, 3], G: 'x', D: [2, 2, 2, 0], Am: [2, 0, 0, 99] },
        guitar: [],
      }),
    );
    expect(loadChordPrefs(store).ukulele).toEqual({ D: [2, 2, 2, 0] });
    store.setItem('lineup.chordprefs.v1', 'not json');
    expect(loadChordPrefs(store)).toEqual({ ukulele: {}, guitar: {} });
    expect(loadChordPrefs(null)).toEqual({ ukulele: {}, guitar: {} });
  });
});
