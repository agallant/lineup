import { describe, expect, it } from 'vitest';
import { chartFromBeats } from '../chart';
import { builtinSongs, getSong } from '../songs';
import { melodyChart } from '../songs/notation';
import {
  applyPart,
  duetPlayers,
  duetTally,
  duetWinner,
  echoChart,
  phraseBars,
  phraseSeconds,
  slicePart,
  songParts,
} from './practice';

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

  it('leaves out silent stretches and a last phrase of a note or two', () => {
    // 120 bpm, 4/4: a bar is 2 s, a phrase (long song) 8 s
    const melody = (text: string) => melodyChart({ title: 't', bpm: 120 }, text);
    const gap = melody('C4 D4 E4 F4 | r:16 | G4 A4 B4 C5 | r:12 | C4');
    const labels = songParts(gap).map((p) => p.label);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    for (const p of songParts(gap)) {
      const inside = gap.notes.filter((n) => n.t >= p.from - 1e-6 && n.t < p.to - 1e-6).length;
      expect(inside).toBeGreaterThanOrEqual(3);
    }
    const lone = songParts(getSong('ex-voice-chromatic-up-down'));
    expect(lone.at(-1)!.label).not.toBe('Bars 7–8'); // the last phrase held a single note
  });

  it('gives consecutive, gap-free parts for every library song', () => {
    for (const [id, chart] of Object.entries(builtinSongs)) {
      const parts = songParts(chart);
      for (let i = 1; i < parts.length; i++)
        expect(parts[i]!.from, id).toBeGreaterThanOrEqual(parts[i - 1]!.to - 1e-6);
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

  it('covers every note at most once across the parts', () => {
    const total = songParts(night).reduce((n, p) => n + slicePart(night, p).notes.length, 0);
    expect(total).toBeLessThanOrEqual(night.notes.length);
    expect(total).toBeGreaterThan(night.notes.length * 0.9);
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

describe('duets', () => {
  const long = chartFromBeats(
    { title: 'd', bpm: 120, instruments: ['voice'] },
    Array.from({ length: 32 }, (_, i) => ({ beat: i, beats: 0.8, pitch: 60 + (i % 5) })),
  );

  it('hands the phrases to the two players in turn', () => {
    const players = duetPlayers(long)!;
    expect(players).toHaveLength(long.notes.length);
    const len = phraseSeconds(long);
    long.notes.forEach((n, i) => expect(players[i]).toBe(Math.floor((n.t + 1e-6) / len) % 2));
    expect(new Set(players)).toEqual(new Set([0, 1]));
    // the first phrase is player 0's
    expect(players[0]).toBe(0);
  });

  it('is not offered for a song with fewer than two phrases', () => {
    const tiny = chartFromBeats({ title: 't', bpm: 120, instruments: ['voice'] }, [
      { beat: 0, beats: 1, pitch: 60 },
      { beat: 1, beats: 1, pitch: 62 },
    ]);
    expect(duetPlayers(tiny)).toBeNull();
  });

  it('tallies each player and names the winner', () => {
    const players = [0, 0, 0, 1, 1, 1];
    const t = duetTally(players, ['perfect', 'good', 'miss', 'perfect', 'pending', 'good']);
    expect(t[0]).toEqual({ hit: 2, perfect: 1, total: 3 });
    expect(t[1]).toEqual({ hit: 2, perfect: 1, total: 3 });
    expect(duetWinner(t[0], t[1])).toBeNull();
    const better = duetTally(players, ['perfect', 'perfect', 'good', 'good', 'miss', 'miss']);
    expect(duetWinner(better[0], better[1])).toBe(0);
    expect(duetWinner(better[1], better[0])).toBe(1);
    // equal hits, more perfects wins
    const close = duetTally(players, ['perfect', 'perfect', 'miss', 'good', 'good', 'miss']);
    expect(duetWinner(close[0], close[1])).toBe(0);
    expect(
      duetWinner({ hit: 0, perfect: 0, total: 0 }, { hit: 0, perfect: 0, total: 0 }),
    ).toBeNull();
  });
});
