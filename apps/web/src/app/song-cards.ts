/** How many songs of a group show before the rest fold away. */
export const PREVIEW_SONGS = 6;

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
  return `${list(ordered.slice(0, preview))}
    <details class="more-songs"><summary>Show all ${ordered.length} songs</summary>${list(ordered.slice(preview))}</details>`;
}
