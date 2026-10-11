import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SettingsStore, keyShiftFor, nextSpeed } from './settings';

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

  it('keeps the Strumline options (chord checking off, normal speed) and rejects bad values', () => {
    const s = new SettingsStore(new Mem());
    expect(s.get()).toMatchObject({ checkChords: false, speed: 1 });
    expect(s.update({ checkChords: true, speed: 0.75 })).toMatchObject({
      checkChords: true,
      speed: 0.75,
    });
    expect(s.update({ speed: 3 }).speed).toBe(1);
    expect(s.update({ speed: 0 }).speed).toBe(1);
    expect(s.update({ speed: Number.NaN }).speed).toBe(1);
    expect(s.update({ checkChords: 'yes' as never }).checkChords).toBe(false);
  });

  it('remembers the wind instrument and the fingering option, and ignores unknown instruments', () => {
    const s = new SettingsStore(new Mem());
    expect(s.get()).toMatchObject({ windInstrument: 'generic', showFingerings: true });
    expect(s.get().windOctave).toBe('auto'); // follow the octave you play unless you ask otherwise
    expect(s.update({ windOctave: 'exact' }).windOctave).toBe('exact');
    expect(s.update({ windOctave: 'sideways' as never }).windOctave).toBe('auto');
    expect(s.update({ windInstrument: 'recorder-alto', showFingerings: false })).toMatchObject({
      windInstrument: 'recorder-alto',
      showFingerings: false,
    });
    expect(s.update({ windInstrument: 'kazoo' }).windInstrument).toBe('generic');
    expect(s.update({ windInstrument: 'ocarina-c12' }).windInstrument).toBe('generic'); // dropped
    expect(s.update({ showFingerings: 1 as never }).showFingerings).toBe(true);
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

  it('keeps a key change per profile; the old single shift still applies to the voice', () => {
    const s = new SettingsStore(new Mem());
    s.update({ keyShift: -3 });
    expect(keyShiftFor(s.get(), 'voice')).toBe(-3);
    expect(keyShiftFor(s.get(), 'wind')).toBe(0);
    s.update({ keyShifts: { wind: 2, voice: 5, bad: 99, frac: 1.5 } });
    expect(keyShiftFor(s.get(), 'wind')).toBe(2);
    expect(keyShiftFor(s.get(), 'voice')).toBe(5);
    expect(s.get().keyShifts).toEqual({ wind: 2, voice: 5 });
  });

  it('remembers an easier or harder version of songs, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().variation).toBe('original');
    expect(s.update({ variation: 'harder' }).variation).toBe('harder');
    expect(new SettingsStore(mem).get().variation).toBe('harder');
    expect(s.update({ variation: 'hardest' as never }).variation).toBe('original');
  });

  it('remembers that the help page was opened', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().seenHelp).toBe(false);
    s.update({ seenHelp: true });
    expect(new SettingsStore(mem).get().seenHelp).toBe(true);
  });

  it('remembers the colour scheme, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().theme).toBe('dark');
    expect(s.update({ theme: 'contrast' }).theme).toBe('contrast');
    expect(new SettingsStore(mem).get().theme).toBe('contrast');
    expect(s.update({ theme: 'neon' as never }).theme).toBe('dark');
  });

  it('remembers listen-first, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().listenFirst).toBe(false);
    expect(s.update({ listenFirst: true }).listenFirst).toBe(true);
    expect(new SettingsStore(mem).get().listenFirst).toBe(true);
    expect(s.update({ listenFirst: 'yes' as never }).listenFirst).toBe(false);
    expect(s.get().blind).toBe(false);
    expect(s.update({ blind: true }).blind).toBe(true);
  });

  it('remembers the weekly goal and text size, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get()).toMatchObject({ goalMinutes: 0, textSize: 'normal' });
    expect(s.update({ goalMinutes: 30, textSize: 'large' })).toMatchObject({
      goalMinutes: 30,
      textSize: 'large',
    });
    expect(new SettingsStore(mem).get()).toMatchObject({ goalMinutes: 30, textSize: 'large' });
    expect(s.update({ goalMinutes: 7, textSize: 'huge' as never })).toMatchObject({
      goalMinutes: 0,
      textSize: 'normal',
    });
  });

  it('remembers the backing under songs, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().accompaniment).toBe('off');
    expect(s.update({ accompaniment: 'full' }).accompaniment).toBe('full');
    expect(new SettingsStore(mem).get().accompaniment).toBe('full');
    expect(s.update({ accompaniment: 'orchestra' as never }).accompaniment).toBe('off');
  });

  it('remembers the difficulty a new random song aims for, and ignores anything else', () => {
    const mem = new Mem();
    const s = new SettingsStore(mem);
    expect(s.get().target).toBeNull();
    expect(s.update({ target: 6 }).target).toBe(6);
    expect(new SettingsStore(mem).get().target).toBe(6);
    for (const bad of [0, 11, 2.5, '3'])
      expect(s.update({ target: bad as never }).target).toBeNull();
  });

  it('keeps a valid random-melody spec and repairs a bad one', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const settings = new SettingsStore(store);
    expect(settings.get().challenge).toEqual({ seed: 1, scale: 'major', level: 'easy' });
    settings.update({ challenge: { seed: 4242, scale: 'dorian', level: 'hard' } });
    expect(new SettingsStore(store).get().challenge).toEqual({
      seed: 4242,
      scale: 'dorian',
      level: 'hard',
    });
    mem.set(
      'lineup.settings.v1',
      JSON.stringify({ challenge: { seed: 1e9, scale: 'locrian', level: 'hard' } }),
    );
    expect(new SettingsStore(store).get().challenge).toEqual({
      seed: 1,
      scale: 'major',
      level: 'hard',
    });
  });
});

describe('nextSpeed', () => {
  it('steps up through the practice speeds and stops at full speed', () => {
    expect(nextSpeed(0.5)).toBe(0.65);
    expect(nextSpeed(0.65)).toBe(0.8);
    expect(nextSpeed(0.8)).toBe(1);
    expect(nextSpeed(1)).toBeNull();
    expect(nextSpeed(0.7)).toBe(0.8);
    expect(nextSpeed(1.25)).toBeNull();
  });
});
