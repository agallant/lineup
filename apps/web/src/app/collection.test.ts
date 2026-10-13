import { songsFor } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { TIER_LABEL, buildCollection, earnedBadges, songHref, tierFor } from './collection';
import { grantMilestones } from './milestones';
import { ProgressStore } from './progress';
import type { BestScore } from './scores';

const best = (accuracy: number): BestScore => ({
  score: 100,
  accuracy,
  grade: 'A',
  at: '2026-10-01T00:00:00Z',
});
const entry = (profile: string, song: string, accuracy: number, variant = 'normal') => ({
  key: `${profile}|${song}|${variant}`,
  best: best(accuracy),
});

describe('tierFor', () => {
  it('gives bronze from a quarter, silver from a half and gold for all', () => {
    expect(tierFor(0, 12)).toBe('none');
    expect(tierFor(2, 12)).toBe('none');
    expect(tierFor(3, 12)).toBe('bronze');
    expect(tierFor(5, 12)).toBe('bronze');
    expect(tierFor(6, 12)).toBe('silver');
    expect(tierFor(11, 12)).toBe('silver');
    expect(tierFor(12, 12)).toBe('gold');
    expect(tierFor(1, 1)).toBe('gold');
    expect(tierFor(1, 4)).toBe('bronze');
    expect(tierFor(0, 0)).toBe('none');
    expect(Object.keys(TIER_LABEL)).toEqual(['none', 'bronze', 'silver', 'gold']);
  });
});

describe('buildCollection', () => {
  it('lists the songs and exercises of each game as families, with nothing cleared at the start', () => {
    const families = buildCollection([]);
    const ids = families.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sing-songs',
        'sing-exercises',
        'wind-songs',
        'wind-flute',
        'wind-exercises',
        'strum-songs',
        'beat-songs',
      ]),
    );
    for (const f of families) {
      expect(f.total, f.id).toBeGreaterThan(0);
      expect(f.cleared, f.id).toBe(0);
      expect(f.tier, f.id).toBe('none');
      expect(f.items.every((i) => i.stars === null)).toBe(true);
    }
    // the flute songs are a family of their own and are not in the Windline songs
    const flute = families.find((f) => f.id === 'wind-flute')!;
    const wind = families.find((f) => f.id === 'wind-songs')!;
    expect(flute.items.every((i) => i.songId.startsWith('flute-'))).toBe(true);
    expect(wind.items.some((i) => i.songId.startsWith('flute-'))).toBe(false);
    expect(flute.items.length).toBe(songsFor('wind').filter((s) => s.category === 'flute').length);
  });

  it('counts a song once it has three stars, playing it whole and as written', () => {
    const total = buildCollection([]).find((f) => f.id === 'sing-songs')!.total;
    const ids = songsFor('voice')
      .filter((s) => s.category === 'song')
      .map((s) => s.id);
    const entries = [
      entry('voice', ids[0]!, 0.97),
      entry('voice', ids[1]!, 0.9), // two stars: not yet
      entry('voice', ids[2]!, 0.99, 'normal|easier'), // an easier version does not count
      entry('voice', ids[3]!, 0.96, 'normal|part2'), // nor does one phrase
    ];
    const f = buildCollection(entries).find((x) => x.id === 'sing-songs')!;
    expect(f.cleared).toBe(1);
    expect(f.items.find((i) => i.songId === ids[1])!.stars).toBe(2);
    expect(f.tier).toBe(tierFor(1, total));
  });

  it('earns a gold badge by clearing everything in a family', () => {
    const all = songsFor('voice').filter((s) => s.category === 'exercise');
    const entries = all.map((s) => entry('voice', s.id, 0.98));
    const families = buildCollection(entries);
    expect(families.find((f) => f.id === 'sing-exercises')!.tier).toBe('gold');
    const badges = earnedBadges(families);
    expect(badges.map((b) => `${b.family.id}:${b.tier}`)).toContain('sing-exercises:gold');
  });
});

describe('songHref', () => {
  it('opens a song in its game, with the sound set for Beatline', () => {
    expect(songHref('voice', 'sing-hot-cross-buns')).toBe('#/sing?song=sing-hot-cross-buns');
    expect(songHref('wind', 'flute-first-breath')).toBe('#/wind?song=flute-first-breath');
    expect(songHref('ukulele-strum', 'strum-blues')).toBe('#/strum?song=strum-blues');
    expect(songHref('drum-kit', 'kit-funk')).toBe('#/beat?mode=drum-kit&song=kit-funk');
  });
});

describe('grantMilestones', () => {
  const mem = () => {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    };
  };

  it('awards Collector at the first badge and Curator at the first gold one, once', () => {
    const progress = new ProgressStore(mem());
    expect(grantMilestones(progress, [])).toEqual([]);
    const ex = songsFor('voice').filter((s) => s.category === 'exercise');
    const some = ex.slice(0, Math.ceil(ex.length / 4)).map((s) => entry('voice', s.id, 0.97));
    expect(grantMilestones(progress, some).map((a) => a.id)).toEqual(['collector']);
    expect(grantMilestones(progress, some)).toEqual([]); // not twice
    const all = ex.map((s) => entry('voice', s.id, 0.97));
    // clearing every voice exercise also finishes a learning path built from them
    expect(grantMilestones(progress, all).map((a) => a.id)).toEqual(['graduate', 'curator']);
    expect(Object.keys(progress.get().achievements)).toEqual(
      expect.arrayContaining(['collector', 'curator']),
    );
  });
});
