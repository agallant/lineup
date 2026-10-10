import { getSong } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { songSummary } from './song-info';

describe('songSummary', () => {
  it('gives the artist, tempo, length and note count', () => {
    expect(songSummary(getSong('strum-four-chords'))).toBe('Lineup · 100 bpm · 0:19 · 48 notes');
    expect(songSummary(getSong('wind-ode'))).toMatch(/^Beethoven · 100 bpm · 0:\d\d · 30 notes$/);
  });

  it('copes with a song with no artist and a single note', () => {
    const chart = getSong('clap-basic');
    const lone = { ...chart, meta: { ...chart.meta, artist: '' }, notes: chart.notes.slice(0, 1) };
    expect(songSummary(lone)).toMatch(/^\d+ bpm · 0:\d\d · 1 note$/);
  });
});
