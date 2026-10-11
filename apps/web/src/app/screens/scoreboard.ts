import { escapeHtml } from '../audio';
import { ACHIEVEMENTS, GAMES, ProgressStore, levelFor, starText } from '../progress';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { scoreRows, sortRows, type ScoreSort } from '../scoreboard';
import { safeLocalStorage } from '../settings';

const SORTS: readonly { id: ScoreSort; label: string }[] = [
  { id: 'recent', label: 'Newest first' },
  { id: 'score', label: 'Highest score' },
  { id: 'stars', label: 'Most stars' },
  { id: 'hardest', label: 'Hardest songs' },
];

const dateText = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

/** Your personal bests, stars, level and trophies: all kept on this device. */
export const scoreboardScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const progress = new ProgressStore(storage);
  const state = progress.get();
  const lvl = levelFor(state.xp);
  const streak = progress.streak();
  const all = scoreRows(new ScoreStore(storage).entries());

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Scoreboard</h1>
    <section class="panel">
      <h2>You</h2>
      <p class="big" data-id="level">Level ${lvl.level} · ${lvl.title}</p>
      <span class="bar" role="img" aria-label="${lvl.into} of ${lvl.span} XP to the next level"><span style="width:${Math.round((lvl.into / lvl.span) * 100)}%"></span></span>
      <dl class="stats">
        <dt>XP</dt><dd data-id="xp">${state.xp.toLocaleString('en-US')}</dd>
        <dt>Songs finished</dt><dd data-id="plays">${state.plays}</dd>
        <dt>Different songs</dt><dd>${state.songs.length}</dd>
        <dt>Days played</dt><dd>${state.days.length}</dd>
        <dt>Streak</dt><dd data-id="streak">${streak} ${streak === 1 ? 'day' : 'days'}</dd>
      </dl>
    </section>

    <section class="panel">
      <h2>Personal bests</h2>
      <div class="row">
        <label>Game <select data-id="game"><option value="">All games</option>${GAMES.map(
          (g) => `<option value="${g.id}">${g.label}</option>`,
        ).join('')}</select></label>
        <label>Sort <select data-id="sort">${SORTS.map(
          (s) => `<option value="${s.id}">${s.label}</option>`,
        ).join('')}</select></label>
      </div>
      <ul class="scores" data-id="rows"></ul>
      <p class="muted" data-id="empty" hidden>No scores yet. Finish a song in any game and it appears here.</p>
      <p class="muted">Stars: ★ 60%, ★★ 80%, ★★★ 95% accuracy. The demo never sets a score.</p>
    </section>

    <section class="panel">
      <h2>Trophies <small>${Object.keys(state.achievements).length} of ${ACHIEVEMENTS.length}</small></h2>
      <ul class="trophies" data-id="trophies">
        ${ACHIEVEMENTS.map((a) => {
          const at = state.achievements[a.id];
          return `<li class="${at ? 'earned' : 'locked'}" data-trophy="${a.id}">
            <strong>${at ? '🏆' : '🔒'} ${escapeHtml(a.title)}</strong>
            <span>${escapeHtml(a.description)}</span>
            ${at ? `<span class="muted">${escapeHtml(dateText(at))}</span>` : ''}
          </li>`;
        }).join('')}
      </ul>
    </section>
  `;

  const gameSel = root.querySelector<HTMLSelectElement>('[data-id=game]')!;
  const sortSel = root.querySelector<HTMLSelectElement>('[data-id=sort]')!;
  const list = root.querySelector<HTMLElement>('[data-id=rows]')!;
  const empty = root.querySelector<HTMLElement>('[data-id=empty]')!;

  const render = (): void => {
    const rows = sortRows(
      all.filter((r) => !gameSel.value || r.gameId === gameSel.value),
      sortSel.value as ScoreSort,
    );
    empty.hidden = rows.length > 0;
    list.innerHTML = rows
      .map(
        (r) => `<li data-game="${r.gameId}">
          <span class="stars" aria-label="${r.stars} of 3 stars">${starText(r.stars)}</span>
          <span class="what"><strong>${escapeHtml(r.title)}</strong>
            <span class="muted">${r.game}${r.rating !== null ? ` · difficulty ${r.rating}/10` : ''}${r.how ? ` · ${escapeHtml(r.how)}` : ''}</span></span>
          <span class="num">${r.score.toLocaleString('en-US')}<span class="muted"> ${escapeHtml(r.grade)} · ${Math.round(r.accuracy * 100)}% · ${escapeHtml(dateText(r.at))}</span></span>
        </li>`,
      )
      .join('');
  };
  gameSel.addEventListener('change', render);
  sortSel.addEventListener('change', render);
  render();
  return undefined;
};
