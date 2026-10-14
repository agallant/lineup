import { midiToFrequency } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { TUNINGS, readTuner, tunerPitchOptions } from './tuner';

const uke = TUNINGS.find((t) => t.id === 'ukulele')!;
const chromatic = TUNINGS.find((t) => t.id === 'chromatic')!;
const hz = (midi: number, cents = 0) => midiToFrequency(midi) * 2 ** (cents / 1200);

describe('readTuner', () => {
  it('names the nearest string and says in tune within five cents', () => {
    const r = readTuner(hz(64, 3), uke)!;
    expect(r).toMatchObject({ name: 'E4', midi: 64, state: 'in-tune', advice: 'In tune' });
    expect(r.cents).toBeCloseTo(3, 3);
  });

  it('says tune up when flat and down when sharp', () => {
    expect(readTuner(hz(69, -20), uke)).toMatchObject({
      name: 'A4',
      state: 'flat',
      advice: 'Too low: tune up',
    });
    expect(readTuner(hz(60, 25), uke)).toMatchObject({
      name: 'C4',
      state: 'sharp',
      advice: 'Too high: tune down',
    });
  });

  it('knows the other tunings', () => {
    const low = TUNINGS.find((t) => t.id === 'ukulele-low-g')!;
    expect(readTuner(hz(55), low)!.name).toBe('G3');
    const bari = TUNINGS.find((t) => t.id === 'baritone')!;
    expect(readTuner(hz(59, -10), bari)).toMatchObject({ name: 'B3', state: 'flat' });
  });

  it('has the guitar, standard and alternate tunings', () => {
    const std = TUNINGS.find((t) => t.id === 'guitar')!;
    expect(std.strings.map((s) => s.name)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(readTuner(hz(40, -8), std)).toMatchObject({ name: 'E2', state: 'flat' });
    const dropD = TUNINGS.find((t) => t.id === 'guitar-drop-d')!;
    expect(dropD.strings[0]).toEqual({ name: 'D2', midi: 38 });
    // the low strings need the low listening range
    expect(tunerPitchOptions(std).minHz).toBeLessThan(60);
    for (const id of ['guitar-dadgad', 'guitar-open-g']) {
      expect(TUNINGS.find((t) => t.id === id)!.strings).toHaveLength(6);
    }
  });

  it('names any note in chromatic mode', () => {
    expect(readTuner(440, chromatic)).toMatchObject({ name: 'A4', state: 'in-tune' });
    expect(readTuner(hz(61, 10), chromatic)).toMatchObject({ name: 'C♯4', state: 'sharp' });
  });

  it('measures against the string the player chose, even when another is nearer', () => {
    // a pitch between C4 and E4 is read against whichever string the player says they are tuning
    const far = hz(62.5);
    expect(readTuner(far, uke, 'C4')).toMatchObject({ name: 'C4', state: 'sharp' });
    expect(readTuner(far, uke, 'A4')).toMatchObject({ name: 'A4', state: 'flat' });
    expect(readTuner(hz(64), uke, 'not a string')!.name).toBe('E4'); // unknown target: nearest
  });

  it('gives nothing for a pitch that is not a frequency', () => {
    expect(readTuner(0, uke)).toBeNull();
    expect(readTuner(Number.NaN, uke)).toBeNull();
  });
});

describe('bass tuning', () => {
  const bass = TUNINGS.find((t) => t.id === 'bass')!;

  it('names the four bass strings and reads a low E', () => {
    expect(bass.strings.map((s) => s.name)).toEqual(['E1', 'A1', 'D2', 'G2']);
    const r = readTuner(41.2, bass)!;
    expect(r.name).toBe('E1');
    expect(r.state).toBe('in-tune');
    expect(readTuner(55, bass)!.name).toBe('A1');
  });

  it('listens lower and over a longer window than for other instruments', () => {
    expect(tunerPitchOptions(bass)).toEqual({ minHz: 30, windowSize: 4096 });
    expect(tunerPitchOptions(uke)).toEqual({ minHz: 60 });
  });
});
