import { escapeHtml } from '../audio';
import {
  TIER_ICON,
  TIER_LABEL,
  buildCollection,
  earnedBadges,
  songHref,
  type Family,
} from '../collection';
import { starText } from '../progress';
import { songCards } from '../song-cards';
import type { Screen } from '../router';
import { ScoreStore } from '../scores';
import { safeLocalStorage } from '../settings';

const familyHtml = (f: Family): string => `
  <section class="panel family" data-family="${f.id}" data-tier="${f.tier}">
    <h2>${escapeHtml(f.label)} <small>${f.cleared} of ${f.total} with three stars</small></h2>
    <p class="badge" data-id="badge-${f.id}"><span aria-hidden="true">${TIER_ICON[f.tier]}</span>
      <strong>${TIER_LABEL[f.tier]}</strong>
      <span class="muted">${nextGoal(f)}</span></p>
    <span class="bar" role="img" aria-label="${f.cleared} of ${f.total} songs with three stars"><span style="width:${Math.round((f.cleared / f.total) * 100)}%"></span></span>
    ${songCards(
      f.items.map((i) => ({
        done: (i.stars ?? 0) >= 3,
        html: `<li class="${(i.stars ?? 0) >= 3 ? 'cleared' : i.stars === null ? 'new' : ''}"><a href="${songHref(i.profileId, i.songId)}"><span class="stars" aria-label="${i.stars ?? 0} of 3 stars">${starText(i.stars ?? 0)}</span> ${escapeHtml(i.title)}</a></li>`,
      })),
    )}
  </section>`;

/** What the next medal needs, in words. */
function nextGoal(f: Family): string {
  const need = (fraction: number): number => Math.max(1, Math.ceil(f.total * fraction)) - f.cleared;
  if (f.tier === 'gold') return 'Every song cleared.';
  if (f.tier === 'silver') return `${f.total - f.cleared} more for gold.`;
  if (f.tier === 'bronze') return `${need(0.5)} more for silver.`;
  return `${need(0.25)} more for bronze.`;
}

/** The collection: every song and exercise, by family, with a medal for how many are three-starred. */
export const collectionScreen: Screen = (root) => {
  const families = buildCollection(new ScoreStore(safeLocalStorage()).entries());
  const badges = earnedBadges(families);
  const gold = badges.filter((b) => b.tier === 'gold').length;
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Collection</h1>
    <p class="muted">Clear a song with three stars (95% accuracy), playing it whole and as written, to add it
      to your collection. Each group of songs earns a bronze medal at a quarter of it, silver at half and gold
      when every song is cleared.</p>
    <p class="big" data-id="summary">${badges.length} ${badges.length === 1 ? 'badge' : 'badges'}
      ${gold > 0 ? ` · ${gold} gold` : ''} · ${families.reduce((a, f) => a + f.cleared, 0)} of
      ${families.reduce((a, f) => a + f.total, 0)} songs with three stars</p>
    ${families.map(familyHtml).join('')}
  `;
  return undefined;
};
