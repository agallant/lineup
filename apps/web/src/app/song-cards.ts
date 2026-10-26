/** How many songs of a group show before the rest fold away. */
export const PREVIEW_SONGS = 6;

/** A folded list this long also gets a box to find a song in it. */
export const FIND_FROM = 40;

/**
 * A group's songs as touch-sized cards: the first few in view, the rest folded under "Show all",
 * so a page of many groups stays short on a phone. Unplayed and uncleared songs come first,
 * keeping the next thing to play in view.
 */
export function songCards(
  cards: readonly { html: string; done: boolean }[],
  preview = PREVIEW_SONGS,
): string {
  const ordered = [...cards.filter((c) => !c.done), ...cards.filter((c) => c.done)];
  const list = (items: readonly { html: string }[]): string =>
    `<ul class="collection">${items.map((c) => c.html).join('')}</ul>`;
  if (ordered.length <= preview + 2) return list(ordered);
  const find =
    ordered.length >= FIND_FROM
      ? `<input type="search" class="song-find" placeholder="Find a song" aria-label="Find a song in this group" />`
      : '';
  return `${list(ordered.slice(0, preview))}
    <details class="more-songs"><summary>Show all ${ordered.length} songs</summary>${find}${list(ordered.slice(preview))}</details>`;
}

/** Whether a song card's text matches what was typed in a find box (any case; empty matches all). */
export function matchesFind(text: string, typed: string): boolean {
  const words = typed.trim().toLowerCase();
  return words === '' || text.toLowerCase().includes(words);
}

/** Makes each "Find a song" box narrow the folded list it sits in, as the player types. */
export function wireSongFinds(root: HTMLElement): void {
  root.addEventListener('input', (e) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || !box.classList.contains('song-find')) return;
    for (const li of box.parentElement?.querySelectorAll('li') ?? []) {
      li.hidden = !matchesFind(li.textContent ?? '', box.value);
    }
  });
}
