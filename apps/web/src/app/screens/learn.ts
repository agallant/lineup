import { escapeHtml } from '../audio';
import { COURSES, courseProgress, stepHref, type StepState } from '../courses';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { starsBySong } from '../scoreboard';
import { ProgressStore, starText } from '../progress';
import { safeLocalStorage } from '../settings';
import { getSong } from '@lineup/core';

const ICON: Record<StepState, string> = {
  locked: '🔒',
  open: '▶',
  cleared: '✔',
  mastered: '★',
};

/** Learning paths: a short ordered list of songs and exercises for each instrument, opened as you go. */
export const learnScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const entries = new ScoreStore(storage).entries();
  const progressStore = new ProgressStore(storage);
  let newTrophy = '';
  const sections = COURSES.map((course) => {
    const stars = starsBySong(entries, course.profileId);
    const progress = courseProgress(course, (id) => stars.get(id) ?? null);
    const next = progress.steps.find((s) => s.state === 'open');
    // finishing a path earns the Graduate trophy (once)
    if (progress.done && progressStore.grant('graduate')) {
      newTrophy = `<p class="reward" data-id="graduate">🏆 <strong>Graduate</strong>: you mastered every step of “${escapeHtml(course.title)}”.</p>`;
    }
    return `<section class="panel" data-course="${course.id}">
      <h2>${escapeHtml(course.title)} <small>${progress.mastered} of ${progress.steps.length} mastered</small></h2>
      <p class="muted">${escapeHtml(course.blurb)}</p>
      <span class="bar" role="img" aria-label="${progress.mastered} of ${progress.steps.length} steps mastered"><span style="width:${Math.round((progress.mastered / progress.steps.length) * 100)}%"></span></span>
      <ol class="steps">
        ${progress.steps
          .map((s) => {
            const title = getSong(s.songId).meta.title;
            const body = `<span class="icon" aria-hidden="true">${ICON[s.state]}</span>
              <span class="what"><strong>${escapeHtml(title)}</strong><span class="muted">${escapeHtml(s.focus)}</span></span>
              <span class="stars">${s.stars === null ? '' : starText(Math.min(3, s.stars))}</span>`;
            return s.state === 'locked'
              ? `<li class="locked" data-step="${s.songId}" aria-label="${escapeHtml(title)}, locked">${body}</li>`
              : `<li class="${s.state}" data-step="${s.songId}"><a href="${stepHref(course, s)}">${body}</a></li>`;
          })
          .join('')}
      </ol>
      ${
        progress.done
          ? '<p class="status ok">Path complete. Every step mastered!</p>'
          : next
            ? `<p><a class="card" href="${stepHref(course, next)}" data-id="continue-${course.id}"><strong>Continue: ${escapeHtml(getSong(next.songId).meta.title)}</strong><span class="muted">${escapeHtml(next.focus)}</span></a></p>`
            : ''
      }
    </section>`;
  });
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Learn</h1>
    <p class="muted">Short paths from first notes to a whole repertoire. Earn one star (60%) on a step to open the next,
      two (80%) to master it. Mastered steps are tracked on this device.</p>
    ${newTrophy}
    ${sections.join('')}
  `;
  return undefined;
};
