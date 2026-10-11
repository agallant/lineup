import { describe, expect, it } from 'vitest';
import { builtinSongs, getSong } from '../songs';
import { applyPart, echoChart, phraseBars, slicePart, songParts } from './practice';

describe('songParts', () => {
  it('cuts a song into phrases at bar lines, and leaves very short ones whole', () => {
    const buns = getSong('sing-hot-cross-buns'); // 4 bars
    expect(songParts(buns).map((p) => p.label)).toEqual(['Bars 1–2', 'Bars 3–4']);
    const night = getSong('sing-silent-night'); // 3/4, 24 bars
    const parts = songParts(night);
    expect(parts).toHaveLength(Math.ceil(night.notes.at(-1)!.t / ((60 / night.meta.bpm) * 3 * 4)));
    expect(parts[0]!.label).toBe('Bars 1–4');
    const barLen = (60 / night.meta.bpm) * 3;
    expect(parts[1]!.from).toBeCloseTo(4 * barLen, 6);
    expect(phraseBars(night)).toBe(4);
  });

  it('gives consecutive, gap-free parts for every library song', () => {
    for (const [id, chart] of Object.entries(builtinSongs)) {
      const parts = songParts(chart);
      for (let i = 1; i < parts.length; i++) expect(parts[i]!.from, id).toBe(parts[i - 1]!.to);
      if (parts.length) expect(parts.at(-1)!.to, id).toBeGreaterThan(chart.notes.at(-1)!.t);
    }
  });
});

describe('slicePart / applyPart', () => {
  const night = getSong('sing-silent-night');
  it('keeps only the notes of the phrase, moved to the start', () => {
    const part = songParts(night)[1]!;
    const sliced = slicePart(night, part);
    const inside = night.notes.filter((n) => n.t >= part.from - 1e-6 && n.t < part.to - 1e-6);
    expect(sliced.notes).toHaveLength(inside.length);
    expect(sliced.notes[0]!.t).toBeCloseTo(inside[0]!.t - part.from, 5);
    expect(sliced.notes[0]!.pitch).toBe(inside[0]!.pitch);
    expect(sliced.meta).toEqual(night.meta);
  });

  it('covers every note exactly once across the parts', () => {
    const total = songParts(night).reduce((n, p) => n + slicePart(night, p).notes.length, 0);
    expect(total).toBe(night.notes.length);
  });

  it('applies -1 or a missing part as the whole song', () => {
    expect(applyPart(night, -1)).toBe(night);
    expect(applyPart(night, 99)).toBe(night);
    expect(applyPart(night, 0).notes.length).toBeLessThan(night.notes.length);
  });
});

describe('echoChart', () => {
  it('moves every note later by whole beats, past the end of the original', () => {
    const song = getSong('sing-hot-cross-buns');
    const spb = 60 / song.meta.bpm;
    const { chart, listenEnd } = echoChart(song);
    const end = song.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0);
    expect(listenEnd).toBeGreaterThan(end);
    expect(listenEnd / spb).toBeCloseTo(Math.round(listenEnd / spb), 5);
    expect(chart.notes).toHaveLength(song.notes.length);
    chart.notes.forEach((n, i) => {
      expect(n.t).toBeCloseTo(song.notes[i]!.t + listenEnd, 5);
      expect(n.pitch).toBe(song.notes[i]!.pitch);
    });
    expect(chart.meta).toEqual(song.meta);
  });
});
