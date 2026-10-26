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

/** The game each path is played in, for the row of game buttons above the paths. */
const GAME_OF: Record<string, string> = {
  voice: 'Singline',
  wind: 'Windline',
  'ukulele-strum': 'Strumline',
  'guitar-strum': 'Strumline',
  bass: 'Bassline',
  keyboard: 'Keyline',
  clap: 'Beatline',
  'drum-kit': 'Beatline',
};
const GAME_KEY = 'lineup.learn.game';

/** Learning paths: a short ordered list of songs and exercises for each instrument, opened as you go. */
export const learnScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const entries = new ScoreStore(storage).entries();
  const progressStore = new ProgressStore(storage);
  let newTrophy = '';
  const sections = COURSES.map((course, order) => {
    const stars = starsBySong(entries, course.profileId, true);
    const progress = courseProgress(course, (id) => stars.get(id) ?? null);
    const next = progress.steps.find((s) => s.state === 'open');
    // a path the player has begun shows its steps; the others stay folded away
    const started = progress.steps.some((s) => s.stars !== null);
    // normally granted when the last step is played; this catches a path finished before that existed
    if (progress.done && progressStore.grant('graduate')) {
      newTrophy = `<p class="reward" data-id="graduate">🏆 <strong>Graduate</strong>: you mastered every step of “${escapeHtml(course.title)}”.</p>`;
    }
    const html = `<section class="panel" data-course="${course.id}" data-game="${GAME_OF[course.profileId] ?? ''}">
      <h2>${escapeHtml(course.title)} <small>${progress.mastered} of ${progress.steps.length} mastered</small></h2>
      <p class="muted">${escapeHtml(course.blurb)}</p>
      <span class="bar" role="img" aria-label="${progress.mastered} of ${progress.steps.length} steps mastered"><span style="width:${Math.round((progress.mastered / progress.steps.length) * 100)}%"></span></span>
      ${
        progress.done
          ? '<p class="status ok">Path complete. Every step mastered!</p>'
          : next
            ? `<p><a class="card" href="${stepHref(course, next)}" data-id="continue-${course.id}"><strong>${started ? 'Continue' : 'Start'}: ${escapeHtml(getSong(next.songId).meta.title)}</strong><span class="muted">${escapeHtml(next.focus)}</span></a></p>`
            : ''
      }
      <details data-id="steps-${course.id}" ${started && !progress.done ? 'open' : ''}>
        <summary>All ${progress.steps.length} steps</summary>
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
      </details>
    </section>`;
    // paths under way come first, then the untouched ones, then the finished ones; each in course order
    return { html, rank: started && !progress.done ? 0 : progress.done ? 2 : 1, order };
  });
  sections.sort((a, b) => a.rank - b.rank || a.order - b.order);
  const games = [...new Set(COURSES.map((c) => GAME_OF[c.profileId] ?? ''))].filter(Boolean);
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Learn</h1>
    <p class="muted">Short paths from first notes to a whole repertoire. Earn one star (60%) on a step to open the next,
      two (80%) to master it. Mastered steps are tracked on this device.</p>
    ${newTrophy}
    <div class="row chips" role="group" aria-label="Show the paths for" data-id="learn-games">
      ${['All', ...games].map((g) => `<button type="button" data-game="${g}">${g}</button>`).join('')}
    </div>
    ${sections.map((x) => x.html).join('')}
  `;
  const show = (game: string): void => {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-id=learn-games] button')) {
      b.setAttribute('aria-pressed', String(b.dataset['game'] === game));
    }
    for (const sec of root.querySelectorAll<HTMLElement>('section[data-course]')) {
      sec.hidden = game !== 'All' && sec.dataset['game'] !== game;
    }
  };
  const remembered = (() => {
    try {
      return storage?.getItem(GAME_KEY) ?? 'All';
    } catch {
      return 'All';
    }
  })();
  show(['All', ...games].includes(remembered) ? remembered : 'All');
  root.querySelector('[data-id=learn-games]')?.addEventListener('click', (e) => {
    const game = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset['game'];
    if (!game) return;
    show(game);
    try {
      storage?.setItem(GAME_KEY, game);
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  });
  return undefined;
};
