import type { Chart } from '@lineup/core';

/** The words of a song split into the syllables that go under its notes, one for each pitched note. */
export const syllables = (lyrics: string): string[] => lyrics.split(/\s+/).filter((w) => w !== '');

/** How early the next word shows, in seconds, so it can be read before the note arrives. */
const LEAD_S = 0.2;

/**
 * The index of the note whose word to show at a song time: the last note that has started (or is
 * about to), or -1 before the first.
 */
export function lyricIndexAt(chart: Chart, songTime: number): number {
  let index = -1;
  for (let i = 0; i < chart.notes.length; i++) {
    if (chart.notes[i]!.t <= songTime + LEAD_S) index = i;
    else break;
  }
  return index;
}

/** The words around a note as text with the current one marked: "twin-kle [twin] kle". */
export function lyricWindow(
  words: readonly string[],
  index: number,
  around = 3,
): { before: string; current: string; after: string } {
  const at = Math.min(index, words.length - 1);
  if (at < 0) return { before: '', current: '', after: words.slice(0, around + 1).join(' ') };
  return {
    before: words.slice(Math.max(0, at - around), at).join(' '),
    current: words[at] ?? '',
    after: words.slice(at + 1, at + 1 + around).join(' '),
  };
}
