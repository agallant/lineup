import { escapeHtml } from '../audio';
import { songHref } from '../collection';
import { buildPacks, type Pack } from '../packs';
import { starText } from '../progress';
import { songCards, wireSongFinds } from '../song-cards';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { safeLocalStorage } from '../settings';

const GAME: Record<string, string> = {
  voice: 'Singline',
  wind: 'Windline',
  'ukulele-strum': 'Strumline',
  'guitar-strum': 'Strumline',
  'guitar-strum-dropd': 'Strumline',
  'guitar-strum-dadgad': 'Strumline',
  'guitar-strum-openg': 'Strumline',
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
    ${songCards(
      p.songs.map((s) => ({
        done: (s.stars ?? 0) >= 3,
        html: `<li class="${(s.stars ?? 0) >= 3 ? 'cleared' : s.stars === null ? 'new' : ''}"><a href="${songHref(s.profileId, s.songId)}"><span class="stars" aria-label="${s.stars ?? 0} of 3 stars">${starText(s.stars ?? 0)}</span> ${escapeHtml(s.title)} <small class="muted">${GAME[s.profileId] ?? ''} · difficulty ${s.rating}</small></a></li>`,
      })),
    )}
  </section>`;

const GAME_KEY = 'lineup.packs.game';

/** A pack with only the songs of one game (all of them for "All"), or null when none are left. */
const forGame = (p: Pack, game: string): Pack | null => {
  if (game === 'All') return p;
  const songs = p.songs.filter((s) => GAME[s.profileId] === game);
  if (songs.length === 0) return null;
  return { ...p, songs, cleared: songs.filter((s) => (s.stars ?? 0) >= 3).length };
};

/** Song packs: themed sets of songs from across the games, each song opening in its game. */
export const packsScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const packs = buildPacks(new ScoreStore(storage).entries());
  // the games that have songs in some pack, in the order of the home menu
  const games = [...new Set(Object.values(GAME))].filter((g) =>
    packs.some((p) => p.songs.some((s) => GAME[s.profileId] === g)),
  );
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Song packs</h1>
    <p class="muted">Themed sets of songs from every game. Tap a song to open it in its game. Packs of
      your own songs can be shared from <a href="#/make">My songs</a>.</p>
    <div class="row chips" role="group" aria-label="Show the songs for" data-id="pack-games">
      ${['All', ...games].map((g) => `<button type="button" data-game="${g}">${g}</button>`).join('')}
    </div>
    <div data-id="pack-list"></div>
  `;
  const show = (game: string): void => {
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-id=pack-games] button')) {
      b.setAttribute('aria-pressed', String(b.dataset['game'] === game));
    }
    const list = root.querySelector<HTMLElement>('[data-id=pack-list]')!;
    list.innerHTML = packs
      .map((p) => forGame(p, game))
      .filter((p): p is Pack => p !== null)
      .map(packHtml)
      .join('');
  };
  const remembered = (() => {
    try {
      return storage?.getItem(GAME_KEY) ?? 'All';
    } catch {
      return 'All';
    }
  })();
  show(['All', ...games].includes(remembered) ? remembered : 'All');
  root.querySelector('[data-id=pack-games]')?.addEventListener('click', (e) => {
    const game = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset['game'];
    if (!game) return;
    show(game);
    try {
      storage?.setItem(GAME_KEY, game);
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  });
  wireSongFinds(root);
  return undefined;
};
