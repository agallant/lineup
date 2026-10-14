import { getSong, songsFor } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { buildPacks } from './packs';

describe('song packs', () => {
  const packs = buildPacks([]);

  it('has a handful of themed packs, none empty', () => {
    expect(packs.map((p) => p.id)).toEqual([
      'campfire',
      'lullabies',
      'waltz',
      'pentatonic',
      'bass-lines',
      'key-pieces',
      'rhythm',
      'gentle',
      'minor',
      'originals',
      'chromatic',
      'challenge',
    ]);
    for (const p of packs) {
      expect(p.songs.length, p.id).toBeGreaterThanOrEqual(4);
      expect(new Set(p.songs.map((s) => `${s.profileId}|${s.songId}`)).size).toBe(p.songs.length);
    }
  });

  it('lists only songs that exist, for the game they are written for', () => {
    for (const p of packs) {
      for (const s of p.songs) {
        const chart = getSong(s.songId);
        expect(chart.meta.instruments, `${p.id} ${s.songId}`).toContain(s.profileId);
        expect(s.title).toBe(chart.meta.title);
        expect(s.rating).toBeGreaterThanOrEqual(1);
        expect(s.rating).toBeLessThanOrEqual(10);
      }
    }
  });

  it('puts the right songs in the themed packs', () => {
    const by = (id: string) => packs.find((p) => p.id === id)!;
    expect(by('waltz').songs.every((s) => getSong(s.songId).meta.beatsPerBar === 3)).toBe(true);
    expect(by('waltz').songs.length).toBeGreaterThanOrEqual(3);
    expect(
      by('rhythm').songs.every((s) =>
        ['clap', 'hand-percussion', 'drum-kit'].includes(s.profileId),
      ),
    ).toBe(true);
    expect(by('pentatonic').songs.every((s) => s.songId.startsWith('flute-'))).toBe(true);
    expect(by('challenge').songs.every((s) => s.rating >= 7)).toBe(true);
    expect(by('gentle').songs.every((s) => s.rating <= 2)).toBe(true);
    expect(by('campfire').songs.map((s) => s.songId)).toContain('sing-oh-susanna');
    // sorted easiest first
    for (const p of packs) {
      const r = p.songs.map((s) => s.rating);
      expect(r).toEqual([...r].sort((a, b) => a - b));
    }
    expect(songsFor('voice').length).toBeGreaterThan(0);
  });

  it('counts three-star songs from the scores', () => {
    const key = 'voice|sing-oh-susanna|normal';
    const withScore = buildPacks([
      { key, best: { score: 900, accuracy: 0.97, grade: 'S', at: '2026-10-01T00:00:00Z' } },
    ]);
    const campfire = withScore.find((p) => p.id === 'campfire')!;
    expect(campfire.cleared).toBe(1);
    expect(campfire.songs.find((s) => s.songId === 'sing-oh-susanna')!.stars).toBe(3);
    expect(buildPacks([]).find((p) => p.id === 'campfire')!.cleared).toBe(0);
  });
});
