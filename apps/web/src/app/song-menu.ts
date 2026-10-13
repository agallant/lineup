import { starText } from './progress';
import { rateChart, ratingText, type Chart, type SongCategory } from '@lineup/core';

/** The slice of a song the menu needs. */
export interface MenuSong {
  id: string;
  chart: Chart;
  category: SongCategory;
}

export interface MenuGroup {
  /** The heading, or null when there is only one kind of entry and no heading is needed. */
  label: string | null;
  items: { id: string; title: string; score: number }[];
}

const HEADINGS: readonly { category: SongCategory; label: string }[] = [
  { category: 'flute', label: 'Pentatonic flute songs' },
  { category: 'song', label: 'Songs' },
  { category: 'exercise', label: 'Exercises' },
];

/**
 * The menu entries grouped by kind, in a fixed order. Songs run from easiest to hardest (by the
 * rating worked out from the chart, ties in their own order); exercises keep their own order,
 * which groups them by scale. Each entry says how hard it is and, for a melody, whether it is
 * diatonic or needs sharps and flats.
 */
export function songMenuGroups(
  songs: readonly MenuSong[],
  starsOf: (id: string) => number | null = () => null,
): MenuGroup[] {
  const groups = HEADINGS.map(({ category, label }) => ({
    label,
    items: songs
      .filter((s) => s.category === category)
      .map((s) => {
        const rating = rateChart(s.chart);
        const stars = starsOf(s.id);
        return {
          id: s.id,
          title: `${s.chart.meta.title} · ${ratingText(rating)}${stars === null ? '' : ` · best ${starText(stars)}`}`,
          score: rating.score,
        };
      })
      .map((item, index) => ({ item, index }))
      .sort((a, b) =>
        category !== 'exercise'
          ? a.item.score - b.item.score || a.index - b.index
          : a.index - b.index,
      )
      .map(({ item }) => item),
  })).filter((g) => g.items.length > 0);
  return groups.length === 1 ? [{ label: null, items: groups[0]!.items }] : groups;
}

/** Fills a <select> with the songs (with the stars earned on each, if given), under "Songs" and "Exercises" headings when both exist. */
export function fillSongMenu(
  select: HTMLSelectElement,
  songs: readonly MenuSong[],
  starsOf?: (id: string) => number | null,
): void {
  for (const group of songMenuGroups(songs, starsOf)) {
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

/** The value of the song menu's "random melody" entry. */
export const RANDOM_MELODY = 'random-melody';

/** The value of the "random flute song" entry (Windline, on a pentatonic flute). */
export const RANDOM_FLUTE = 'random-flute';

/** The value of the "random chord song" entry (Strumline). */
export const RANDOM_CHORDS = 'random-chords';

/** The value of the "random waltz" entry (Strumline): a chord song in three beats to the bar. */
export const RANDOM_WALTZ = 'random-waltz';

/** The value of the "random groove" entry (Beatline). */
export const RANDOM_GROOVE = 'random-groove';

/** Adds entries to a song menu under a "Random" heading. */
export function addRandomOptions(
  select: HTMLSelectElement,
  entries: readonly { value: string; label: string }[],
): void {
  const group = select.appendChild(heading('Random'));
  for (const { value, label } of entries) group.appendChild(new Option(label, value));
}

/** Adds the "random melody" entry to a song menu, under its own heading. */
export function addRandomMelodyOption(select: HTMLSelectElement): void {
  addRandomOptions(select, [{ value: RANDOM_MELODY, label: '🎲 Random melody' }]);
}

/** Fills the "aim for" menu of a random song: any difficulty, or 1 (easiest) to 10 (hardest). */
export function fillTargetMenu(select: HTMLSelectElement): void {
  select.add(new Option('Any difficulty', '0'));
  for (let n = 1; n <= 10; n++) select.add(new Option(String(n), String(n)));
}
