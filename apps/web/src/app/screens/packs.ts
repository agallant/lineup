import { escapeHtml } from '../audio';
import { songHref } from '../collection';
import { buildPacks, type Pack } from '../packs';
import { starText } from '../progress';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { safeLocalStorage } from '../settings';

const GAME: Record<string, string> = {
  voice: 'Singline',
  wind: 'Windline',
  'ukulele-strum': 'Strumline',
  'guitar-strum': 'Strumline',
  bass: 'Bassline',
  keyboard: 'Keyline',
  clap: 'Beatline',
  'hand-percussion': 'Beatline',
  'drum-kit': 'Beatline',
};

const packHtml = (p: Pack): string => `
  <section class="panel pack" data-pack="${p.id}">
    <h2>${escapeHtml(p.title)} <small>${p.cleared} of ${p.songs.length} with three stars</small></h2>
    <p class="muted">${escapeHtml(p.blurb)}</p>
    <ul class="collection">
      ${p.songs
        .map(
          (s) =>
            `<li class="${(s.stars ?? 0) >= 3 ? 'cleared' : s.stars === null ? 'new' : ''}"><a href="${songHref(s.profileId, s.songId)}"><span class="stars" aria-label="${s.stars ?? 0} of 3 stars">${starText(s.stars ?? 0)}</span> ${escapeHtml(s.title)} <small class="muted">${GAME[s.profileId] ?? ''} · difficulty ${s.rating}</small></a></li>`,
        )
        .join('')}
    </ul>
  </section>`;

/** Song packs: themed sets of songs from across the games, each song opening in its game. */
export const packsScreen: Screen = (root) => {
  const packs = buildPacks(new ScoreStore(safeLocalStorage()).entries());
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Song packs</h1>
    <p class="muted">Themed sets of songs from every game. Tap a song to open it in its game. Packs of
      your own songs can be shared from <a href="#/make">My songs</a>.</p>
    ${packs.map(packHtml).join('')}
  `;
  return undefined;
};
