import { generateChordSong, getSong, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { parseChord, planAccompaniment } from './accompaniment';

const tones = (chart: Chart, level: 'bass' | 'full') =>
  planAccompaniment(chart, level).flatMap((e) => (e.kind === 'tone' ? [e] : []));

describe('parseChord', () => {
  it('reads roots, minors and sevenths', () => {
    expect(parseChord('C')).toEqual({ root: 0, minor: false, seventh: false });
    expect(parseChord('F#m')).toEqual({ root: 6, minor: true, seventh: false });
    expect(parseChord('Bb')).toEqual({ root: 10, minor: false, seventh: false });
    expect(parseChord('G7')).toEqual({ root: 7, minor: false, seventh: true });
    expect(parseChord('Hm')).toBeNull();
  });
});

describe('planAccompaniment', () => {
  it('plays a chord song’s own chords: the root of each chord on the bar', () => {
    const song = getSong('strum-fifties'); // C Am F G, four beats a bar
    const bass = tones(song, 'bass').filter((t) => t.wave === 'triangle');
    const spb = 60 / song.meta.bpm;
    const firstOfBar = bass.filter((t) => Math.abs((t.songTime / spb) % 4) < 1e-6);
    // C, A, F, G: the low roots of the first four bars (MIDI 48, 45, 41, 43)
    expect(firstOfBar.slice(0, 4).map((t) => t.midi % 12)).toEqual([0, 9, 5, 7]);
    expect(bass.every((t) => t.midi >= 40 && t.midi < 59)).toBe(true);
  });

  it('adds a soft chord on top at the full level only', () => {
    const song = getSong('strum-fifties');
    expect(tones(song, 'bass').some((t) => t.wave === 'sine')).toBe(false);
    const full = tones(song, 'full');
    const pad = full.filter((t) => t.wave === 'sine');
    expect(pad.length).toBeGreaterThan(0);
    expect(pad.every((t) => (t.level ?? 1) < 1)).toBe(true);
    // three notes of the first chord (C E G) at the first bar
    expect(
      pad
        .filter((t) => t.songTime === 0)
        .map((t) => t.midi % 12)
        .sort((a, b) => a - b),
    ).toEqual([0, 4, 7]);
  });

  it('follows a waltz in three beats to the bar', () => {
    const waltz = generateChordSong({ seed: 4, level: 'medium', waltz: true });
    const spb = 60 / waltz.meta.bpm;
    const bass = tones(waltz, 'bass');
    expect(bass.length).toBeGreaterThan(10);
    expect(bass.every((t) => Math.abs((t.songTime / spb) % 3) < 1e-6)).toBe(true);
  });

  it('harmonises a melody from its notes: Hot Cross Buns sits on C, and it ends at home', () => {
    const tune = getSong('sing-hot-cross-buns');
    const bass = tones(tune, 'bass').filter((t) => t.wave === 'triangle');
    expect(bass[0]!.midi % 12).toBe(0); // starts on C
    expect(bass.at(-1)!.midi % 12 === 0 || bass.at(-1)!.midi % 12 === 7).toBe(true); // C, or its fifth
    // every bass note is low and quiet enough not to cover the tune
    expect(bass.every((t) => t.midi < 60)).toBe(true);
  });

  it('moves with the song’s key', () => {
    const c = getSong('wind-twinkle');
    const up = tones(
      {
        ...c,
        meta: { ...c.meta, tonic: (c.meta.tonic ?? 72) + 2 },
        notes: c.notes.map((n) => ({ ...n, pitch: (n.pitch ?? 0) + 2 })),
      },
      'bass',
    );
    const base = tones(c, 'bass');
    expect(up[0]!.midi % 12).toBe((base[0]!.midi + 2) % 12);
  });

  it('plays nothing under a rhythm', () => {
    expect(planAccompaniment(getSong('clap-basic'), 'full')).toEqual([]);
  });

  it('harmonises a plucked ukulele melody too', () => {
    const bass = tones(getSong('pick-ode-to-joy'), 'bass');
    expect(bass.length).toBeGreaterThan(0);
    expect(bass[0]!.midi % 12).toBe(0);
  });
});
