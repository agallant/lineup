import type { SongCategory } from '@lineup/core';

/** The slice of a song the menu needs. */
export interface MenuSong {
  id: string;
  chart: { meta: { title: string } };
  category: SongCategory;
}

export interface MenuGroup {
  /** The heading, or null when there is only one kind of entry and no heading is needed. */
  label: string | null;
  items: { id: string; title: string }[];
}

const HEADINGS: readonly { category: SongCategory; label: string }[] = [
  { category: 'song', label: 'Songs' },
  { category: 'exercise', label: 'Exercises' },
];

/** The menu entries grouped by kind, in a fixed order, keeping each group's own order. */
export function songMenuGroups(songs: readonly MenuSong[]): MenuGroup[] {
  const groups = HEADINGS.map(({ category, label }) => ({
    label,
    items: songs
      .filter((s) => s.category === category)
      .map((s) => ({ id: s.id, title: s.chart.meta.title })),
  })).filter((g) => g.items.length > 0);
  return groups.length === 1 ? [{ label: null, items: groups[0]!.items }] : groups;
}

/** Fills a <select> with the songs, under "Songs" and "Exercises" headings when both exist. */
export function fillSongMenu(select: HTMLSelectElement, songs: readonly MenuSong[]): void {
  for (const group of songMenuGroups(songs)) {
    const parent: HTMLElement =
      group.label === null ? select : select.appendChild(heading(group.label));
    for (const item of group.items) parent.appendChild(new Option(item.title, item.id));
  }
}

function heading(label: string): HTMLOptGroupElement {
  const g = document.createElement('optgroup');
  g.label = label;
  return g;
}
