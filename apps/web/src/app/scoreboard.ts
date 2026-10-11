import { EAR_RATING, earTitle, getSong, rateChart, type EarLevel } from '@lineup/core';
import { gameOf, starsFor } from './progress';
import { COURSES, courseProgress, type StepProgress } from './courses';
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
    const part = /^part(\d+)$/.exec(token);
    if (speed) {
      if (Number(speed[1]) !== 1) parts.push(`${Number(speed[1])}× speed`);
      if (speed[2]) parts.push('chords checked');
    } else if (part) parts.push(`part ${part[1]}`);
    else if (token === 'echo') parts.push('listen first');
    else if (token === 'blind') parts.push('unseen');
    else if (token === 'easier' || token === 'harder') parts.push(`${token} version`);
    else if (token === 'mixed') parts.push('mixed version');
    else if (token === 'easy' || token === 'strict') parts.push(`${token} scoring`);
    // "normal" scoring and "anyoctave" are the usual way: nothing to say
  }
  return parts.join(', ');
}

/** Whether a score was set playing a song whole, as written, at full speed and with its usual help. */
export function isPlainVariant(variant: string): boolean {
  return variant
    .split('|')
    .filter(Boolean)
    .every(
      (t) => t === 'normal' || t === 'easy' || t === 'strict' || t === 'x1' || t === 'anyoctave',
    );
}

/** Turns the stored best scores into rows, resolving titles and difficulty from the song library. */
export function scoreRows(
  entries: readonly { key: string; best: BestScore }[],
  mine: (id: string) => { title: string; rating: number } | null = () => null,
): ScoreRow[] {
  const rows: ScoreRow[] = [];
  for (const { key, best } of entries) {
    const [profileId = '', songId = '', variant = ''] = key.split('|');
    const game = gameOf(profileId);
    if (!game) continue;
    // the variant may itself contain bars ("normal|x1|easier"): everything after the song id
    const rest = key.split('|').slice(2).join('|') || variant;
    let title = songId;
    let rating: number | null = null;
    const ear = earTitle(songId);
    const own = ear === null ? mine(songId) : null;
    if (own) {
      title = own.title;
      rating = own.rating;
    } else if (ear !== null) {
      title = ear;
      rating = EAR_RATING[songId.split('-').at(-1) as EarLevel] ?? null;
    } else {
      try {
        const chart = getSong(songId);
        title = chart.meta.title;
        rating = rateChart(chart).score;
      } catch {
        // a song this version no longer has: show its id
      }
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

/**
 * The most stars earned on each song of a profile, over every way it has been played (or, with
 * `plainOnly`, only playing it whole and as written).
 */
export function starsBySong(
  entries: readonly { key: string; best: BestScore }[],
  profileId: string,
  plainOnly = false,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { key, best } of entries) {
    const [profile = '', songId = ''] = key.split('|');
    if (profile !== profileId) continue;
    // a learning path counts only the song played whole, not one phrase or an easier version
    if (plainOnly && !isPlainVariant(key.split('|').slice(2).join('|'))) continue;
    out.set(songId, Math.max(out.get(songId) ?? 0, starsFor(best.bestAccuracy ?? best.accuracy)));
  }
  return out;
}

/** The first learning path with every step mastered, or null. */
export function completedCourse(
  entries: readonly { key: string; best: BestScore }[],
): (typeof COURSES)[number] | null {
  for (const course of COURSES) {
    const stars = starsBySong(entries, course.profileId, true);
    if (courseProgress(course, (id) => stars.get(id) ?? null).done) return course;
  }
  return null;
}

/**
 * The learning-path step to suggest next: the open step of the path you played most recently, else
 * the first step of the first path. Null once every path is finished.
 */
export function suggestNext(
  entries: readonly { key: string; best: BestScore }[],
): { course: (typeof COURSES)[number]; step: StepProgress } | null {
  const candidates = COURSES.map((course, order) => {
    const stars = starsBySong(entries, course.profileId, true);
    const progress = courseProgress(course, (id) => stars.get(id) ?? null);
    const step = progress.steps.find((s) => s.state === 'open');
    const played = entries
      .filter((e) => e.key.startsWith(`${course.profileId}|`))
      .reduce((latest, e) => (e.best.at > latest ? e.best.at : latest), '');
    return { course, step, played, order };
  }).filter((c): c is typeof c & { step: StepProgress } => c.step !== undefined);
  candidates.sort((a, b) =>
    a.played < b.played ? 1 : a.played > b.played ? -1 : a.order - b.order,
  );
  const best = candidates[0];
  return best ? { course: best.course, step: best.step } : null;
}
