import { describe, expect, it } from 'vitest';
import { rateChart } from '../difficulty';
import { chartEnd } from '../chart';
import { BASS_EXERCISES, BASS_OPEN, BASS_SONGS, bassChart, bassPluck, bassPlayable } from './bass';
import { builtinSongs, songCategory, songsFor } from './index';

const ALL = { ...BASS_SONGS, ...BASS_EXERCISES };

describe('bass fingering', () => {
  it('finds the lowest fret that plays a note, on one string', () => {
    expect(bassPluck(28)).toEqual([0, null, null, null]); // open E
    expect(bassPluck(33)).toEqual([null, 0, null, null]); // open A
    expect(bassPluck(31)).toEqual([3, null, null, null]); // G1: E string, third fret
    expect(bassPluck(45)).toEqual([null, null, null, 2]); // A2: G string, second fret
    expect(bassPluck(40)).toEqual([null, null, 2, null]); // E2: D string, second fret
  });

  it('knows what the bass cannot play', () => {
    expect(bassPlayable(27)).toBe(false); // below the low E
    expect(bassPlayable(28)).toBe(true);
    expect(bassPlayable(55)).toBe(true); // G3: twelfth fret on the G string
    expect(bassPlayable(56)).toBe(false);
    expect(() => bassPluck(20)).toThrow(/not on the bass/);
  });

  it('writes a line with its strings and frets', () => {
    const c = bassChart({ title: 't', bpm: 100 }, 'E1:1 A1:1 r:1 G2:1');
    expect(c.meta.instruments).toEqual(['bass']);
    expect(c.notes.map((n) => n.pitch)).toEqual([28, 33, 43]);
    expect(c.notes.map((n) => n.expected?.frets)).toEqual([
      [0, null, null, null],
      [null, 0, null, null],
      [null, null, null, 0],
    ]);
  });
});

describe('the bass library', () => {
  it('has a good number of songs and exercises, all for the bass', () => {
    expect(Object.keys(BASS_SONGS).length).toBeGreaterThanOrEqual(25);
    expect(Object.keys(BASS_EXERCISES).length).toBeGreaterThanOrEqual(8);
    expect(songsFor('bass').length).toBe(Object.keys(ALL).length);
    for (const [id, chart] of Object.entries(ALL)) {
      expect(chart.meta.instruments, id).toEqual(['bass']);
      expect(id.startsWith('bass-'), id).toBe(true);
    }
  });

  it('puts every note where the bass can play it, with a fret that sounds it', () => {
    for (const [id, chart] of Object.entries(ALL)) {
      for (const n of chart.notes) {
        expect(bassPlayable(n.pitch!), `${id} ${n.pitch}`).toBe(true);
        const frets = n.expected!.frets!;
        const held = frets.flatMap((f, i) => (f === null ? [] : [BASS_OPEN[i]! + f]));
        expect(held, id).toEqual([n.pitch]);
      }
    }
  });

  it('is rated, filed as songs or exercises, and has sensible lengths and tempos', () => {
    for (const [id, chart] of Object.entries(ALL)) {
      const r = rateChart(chart);
      expect(r.score, id).toBeGreaterThanOrEqual(1);
      expect(r.score, id).toBeLessThanOrEqual(10);
      expect(songCategory(id), id).toBe(id.startsWith('bass-ex-') ? 'exercise' : 'song');
      expect(chart.meta.bpm).toBeGreaterThanOrEqual(60);
      expect(chart.meta.bpm).toBeLessThanOrEqual(120);
      expect(chartEnd(chart)).toBeGreaterThan(4);
      expect(builtinSongs[id]).toBe(chart);
    }
  });

  it('writes a twelve-bar blues as twelve bars of four beats', () => {
    const blues = BASS_SONGS['bass-blues-e-roots']!;
    const beats = (chart: typeof blues) =>
      Math.round(((chartEnd(chart) + 0.5) / (60 / chart.meta.bpm)) * 1) / 1;
    expect(blues.notes).toHaveLength(12);
    expect(blues.notes.map((n) => n.pitch)).toEqual([
      28, 28, 28, 28, 33, 33, 28, 28, 35, 33, 28, 35,
    ]);
    expect(beats(blues)).toBeGreaterThanOrEqual(45);
  });

  it('gets harder with a busier pattern', () => {
    const roots = rateChart(BASS_SONGS['bass-pop-c-roots']!).score;
    const eighths = rateChart(BASS_SONGS['bass-pop-c-eighths']!).score;
    expect(roots).toBeLessThanOrEqual(eighths);
  });
});
