import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore } from './settings';

class Mem implements KeyValueStore {
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

describe('SettingsStore', () => {
  it('starts with defaults and persists updates', () => {
    const mem = new Mem();
    const a = new SettingsStore(mem);
    expect(a.get()).toEqual(DEFAULT_SETTINGS);
    a.update({ debug: true, keyShift: -3, songs: { voice: 'singline-scale' } });
    const b = new SettingsStore(mem);
    expect(b.get()).toEqual({
      ...DEFAULT_SETTINGS,
      debug: true,
      keyShift: -3,
      songs: { voice: 'singline-scale' },
    });
  });

  it('ignores corrupt or hostile stored data field by field', () => {
    const mem = new Mem();
    mem.setItem(
      'lineup.settings.v1',
      JSON.stringify({
        debug: 'yes',
        guideTone: false,
        keyShift: 99,
        songs: { voice: 5, ok: 'x' },
      }),
    );
    expect(new SettingsStore(mem).get()).toEqual({
      ...DEFAULT_SETTINGS,
      guideTone: false,
      songs: { ok: 'x' },
    });
    mem.setItem('lineup.settings.v1', 'not json');
    expect(new SettingsStore(mem).get()).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects out-of-range or fractional key shifts on update', () => {
    const s = new SettingsStore(new Mem());
    expect(s.update({ keyShift: 13 }).keyShift).toBe(0);
    expect(s.update({ keyShift: 1.5 }).keyShift).toBe(0);
    expect(s.update({ keyShift: 12 }).keyShift).toBe(12);
  });

  it('defaults to normal scoring and only accepts known difficulties', () => {
    const s = new SettingsStore(new Mem());
    expect(s.get().difficulty).toBe('normal');
    expect(s.update({ difficulty: 'easy' }).difficulty).toBe('easy');
    expect(s.update({ difficulty: 'impossible' as never }).difficulty).toBe('normal');
    const mem = new Mem();
    mem.setItem('lineup.settings.v1', JSON.stringify({ difficulty: 'strict' }));
    expect(new SettingsStore(mem).get().difficulty).toBe('strict');
  });

  it('keeps working in memory when storage throws or is missing', () => {
    const throwing: KeyValueStore = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('blocked');
      },
    };
    const a = new SettingsStore(throwing);
    expect(a.update({ debug: true }).debug).toBe(true);
    const b = new SettingsStore(null);
    expect(b.update({ metronome: false }).metronome).toBe(false);
  });

  it('get() returns a copy', () => {
    const s = new SettingsStore(new Mem());
    s.get().songs['x'] = 'y';
    expect(s.get().songs).toEqual({});
  });
});
