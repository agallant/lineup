import { getSong, rateChart } from '@lineup/core';
import { gameOf, starsFor } from './progress';
import type { BestScore } from './scores';

/** One line of the personal-best scoreboard. */
export interface ScoreRow {
  key: string;
  gameId: string;
  game: string;
  title: string;
  /** The song's difficulty, 1 to 10, or null if the song is no longer known. */
  rating: number | null;
  /** How it was played: "easier version, 0.8× speed". Empty for the plain way. */
  how: string;
  score: number;
  accuracy: number;
  grade: string;
  stars: 0 | 1 | 2 | 3;
  at: string;
}

/** Words for the parts of a score key's variant, as written by the game screens. */
export function variantLabel(variant: string): string {
  const parts: string[] = [];
  for (const token of variant.split('|').filter(Boolean)) {
    const speed = /^x([\d.]+)(\+chords)?$/.exec(token);
    if (speed) {
      if (Number(speed[1]) !== 1) parts.push(`${Number(speed[1])}× speed`);
      if (speed[2]) parts.push('chords checked');
    } else if (token === 'easier' || token === 'harder') parts.push(`${token} version`);
    else if (token === 'easy' || token === 'hard') parts.push(`${token} scoring`);
    // "normal" scoring and "anyoctave" are the usual way: nothing to say
  }
  return parts.join(', ');
}

/** Turns the stored best scores into rows, resolving titles and difficulty from the song library. */
export function scoreRows(entries: readonly { key: string; best: BestScore }[]): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const { key, best } of entries) {
    const [profileId = '', songId = '', variant = ''] = key.split('|');
    const game = gameOf(profileId);
    if (!game) continue;
    // the variant may itself contain bars ("normal|x1|easier"): everything after the song id
    const rest = key.split('|').slice(2).join('|') || variant;
    let title = songId;
    let rating: number | null = null;
    try {
      const chart = getSong(songId);
      title = chart.meta.title;
      rating = rateChart(chart).score;
    } catch {
      // a song this version no longer has: show its id
    }
    rows.push({
      key,
      gameId: game.id,
      game: game.label,
      title,
      rating,
      how: variantLabel(rest),
      score: best.score,
      accuracy: best.accuracy,
      grade: best.grade,
      stars: starsFor(best.accuracy),
      at: best.at,
    });
  }
  return rows;
}

export type ScoreSort = 'recent' | 'score' | 'stars' | 'hardest';

/** Rows in an order: newest first, highest score, most stars, or hardest song first. */
export function sortRows(rows: readonly ScoreRow[], by: ScoreSort): ScoreRow[] {
  const cmp: Record<ScoreSort, (a: ScoreRow, b: ScoreRow) => number> = {
    recent: (a, b) => b.at.localeCompare(a.at),
    score: (a, b) => b.score - a.score,
    stars: (a, b) => b.stars - a.stars || b.accuracy - a.accuracy,
    hardest: (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.score - a.score,
  };
  return [...rows].sort(cmp[by]);
}

/** The most stars earned on each song of a profile, over every way it has been played. */
export function starsBySong(
  entries: readonly { key: string; best: BestScore }[],
  profileId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { key, best } of entries) {
    const [profile = '', songId = ''] = key.split('|');
    if (profile !== profileId) continue;
    out.set(songId, Math.max(out.get(songId) ?? 0, starsFor(best.accuracy)));
  }
  return out;
}
