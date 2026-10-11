import { escapeHtml } from '../audio';
import { rateChart, type Chart } from '@lineup/core';
import { starText, starsFor, type PlayOutcome, type PlayResult } from '../progress';

/** The stars, XP, level and new trophies a finished song earned, as HTML for the results screen. */
export function rewardHtml(accuracy: number, outcome: PlayOutcome): string {
  const stars = starsFor(accuracy);
  const lines = [
    `<span class="stars" data-id="stars" aria-label="${stars} of 3 stars">${starText(stars)}</span>`,
    `<span data-id="xp-gained">+${outcome.xpGained} XP</span> · Level ${outcome.level.level} ${escapeHtml(outcome.level.title)}${
      outcome.streak > 1 ? ` · ${outcome.streak}-day streak` : ''
    }`,
  ];
  if (outcome.leveledUp)
    lines.push(
      `<strong data-id="level-up">Level up! You are now a ${escapeHtml(outcome.level.title)}.</strong>`,
    );
  const trophies = outcome.newAchievements.length
    ? `<ul data-id="new-trophies">${outcome.newAchievements
        .map(
          (a) =>
            `<li>🏆 <strong>${escapeHtml(a.title)}</strong>: ${escapeHtml(a.description)}</li>`,
        )
        .join('')}</ul>`
    : '';
  return `<div class="reward" data-id="reward">${lines.join('<br />')}${trophies}</div>`;
}

/** What a finished song tells the progress tracker, worked out from its chart and final score. */
export function playResultFor(
  profileId: string,
  songId: string,
  chart: Chart,
  score: { accuracy: number; counts: { perfect: number; good: number; miss: number } },
): PlayResult {
  const rating = rateChart(chart);
  const { perfect, good, miss } = score.counts;
  return {
    profileId,
    songId,
    accuracy: score.accuracy,
    rating: rating.score,
    chromatic: rating.scale === 'chromatic',
    misses: miss,
    notes: perfect + good + miss,
  };
}
