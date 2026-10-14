import type { KeyValueStore } from '@lineup/core';
import { rateChart } from '@lineup/core';
import { COURSES } from './courses';
import { escapeHtml } from './audio';
import { fillSongMenu, type MenuSong, type SongSort } from './song-menu';

/** Difficulty bands: ratings 1-3, 4-6 and 7-10, or all. */
export type Band = 'all' | 'easy' | 'medium' | 'hard';

export const SORTS: readonly { id: SongSort; label: string }[] = [
  { id: 'easy', label: 'Easiest first' },
  { id: 'hard', label: 'Hardest first' },
  { id: 'az', label: 'A to Z' },
  { id: 'stars', label: 'Best stars first' },
];

export const BANDS: readonly { id: Band; label: string }[] = [
  { id: 'all', label: 'Any difficulty' },
  { id: 'easy', label: 'Easy (1 to 3)' },
  { id: 'medium', label: 'Medium (4 to 6)' },
  { id: 'hard', label: 'Hard (7 to 10)' },
];

/** What the song menu shows. */
export interface PickerState {
  /** Text the title must contain (any case). */
  query: string;
  sort: SongSort;
  band: Band;
  /** Hide the songs already cleared with three stars. */
  hideCleared: boolean;
  /** Show the random songs instead of the library. */
  random: boolean;
}

export const DEFAULT_PICKER: PickerState = {
  query: '',
  sort: 'easy',
  band: 'all',
  hideCleared: false,
  random: false,
};

const BAND_RANGE: Record<Band, [number, number]> = {
  all: [0, 10],
  easy: [0, 3],
  medium: [4, 6],
  hard: [7, 10],
};

/** The songs the state lets through. A song with no rating (never expected) passes. */
export function filterSongs(
  songs: readonly MenuSong[],
  state: PickerState,
  starsOf: (id: string) => number | null = () => null,
): MenuSong[] {
  const q = state.query.trim().toLowerCase();
  const [lo, hi] = BAND_RANGE[state.band];
  return songs.filter((s) => {
    if (q && !s.chart.meta.title.toLowerCase().includes(q)) return false;
    if (state.band !== 'all') {
      const score = rateChart(s.chart).score;
      if (score < lo || score > hi) return false;
    }
    if (state.hideCleared && (starsOf(s.id) ?? 0) >= 3) return false;
    return true;
  });
}

const KEY = 'lineup.songpicker.v1';

/** The picker's sort, band and "hide cleared" choices, which last between visits (not the search text). */
export function loadPicker(store: KeyValueStore | null): PickerState {
  try {
    const r = JSON.parse(store?.getItem(KEY) ?? 'null') as Partial<PickerState> | null;
    if (!r || typeof r !== 'object') return { ...DEFAULT_PICKER };
    return {
      ...DEFAULT_PICKER,
      sort: SORTS.some((s) => s.id === r.sort) ? r.sort! : DEFAULT_PICKER.sort,
      band: BANDS.some((b) => b.id === r.band) ? r.band! : DEFAULT_PICKER.band,
      hideCleared: r.hideCleared === true,
    };
  } catch {
    return { ...DEFAULT_PICKER };
  }
}

export function savePicker(store: KeyValueStore | null, state: PickerState): void {
  try {
    store?.setItem(
      KEY,
      JSON.stringify({ sort: state.sort, band: state.band, hideCleared: state.hideCleared }),
    );
  } catch {
    // storage blocked: the choices last for this visit
  }
}

/**
 * The song a first-time player should start on: the first step of the learning path for this game
 * (and sound set), when it is on offer, else the first song of the menu.
 */
export function defaultSongId(
  profileId: string,
  available: readonly { id: string }[],
  mode?: string,
): string | null {
  const course = COURSES.find(
    (c) =>
      c.profileId === profileId && (mode === undefined || c.mode === undefined || c.mode === mode),
  );
  const first = course?.steps.find((s) => available.some((a) => a.id === s.songId));
  return first?.songId ?? available[0]?.id ?? null;
}

export interface PickerFill {
  songs: readonly MenuSong[];
  stars: (id: string) => number | null;
  /** The random entries on offer. */
  random: readonly { value: string; label: string }[];
  state: PickerState;
}

/**
 * Fills a song menu from the picker's state: the library filtered and sorted, or just the random songs
 * when random is chosen. Returns how many entries there are.
 */
export function fillPicker(select: HTMLSelectElement, f: PickerFill): number {
  select.replaceChildren();
  if (f.state.random && f.random.length > 0) {
    for (const r of f.random) select.add(new Option(r.label, r.value));
    return f.random.length;
  }
  const shown = filterSongs(f.songs, f.state, f.stars);
  if (shown.length === 0) {
    const none = new Option('No songs match: change the search or filters', '');
    none.disabled = true;
    select.add(none);
    return 0;
  }
  fillSongMenu(select, shown, f.stars, f.state.sort);
  return shown.length;
}

/**
 * The controls above a song menu: a "Songs / Random song" choice, a search box, how to sort, a
 * difficulty band and "hide cleared". Calls `onChange` whenever one changes. The search box and the
 * filters are hidden while random songs are chosen.
 */
export function mountPickerControls(
  box: HTMLElement,
  state: PickerState,
  { hasRandom, onChange }: { hasRandom: boolean; onChange: () => void },
): { sync: () => void } {
  box.innerHTML = `
    <div class="row" data-id="picker-source" ${hasRandom ? '' : 'hidden'} role="group" aria-label="Where the song comes from">
      <button data-id="src-library" aria-pressed="true">Songs</button>
      <button data-id="src-random" aria-pressed="false">🎲 Random song</button>
    </div>
    <details data-id="picker-filters">
      <summary>Search, sort and filter</summary>
      <div class="row">
        <label>Search <input data-id="picker-query" type="search" placeholder="Title" autocomplete="off" /></label>
        <label>Sort <select data-id="picker-sort">${SORTS.map(
          (s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`,
        ).join('')}</select></label>
        <label>Show <select data-id="picker-band">${BANDS.map(
          (b) => `<option value="${b.id}">${escapeHtml(b.label)}</option>`,
        ).join('')}</select></label>
        <label class="check"><input type="checkbox" data-id="picker-cleared" /> Hide songs I have cleared</label>
      </div>
    </details>`;
  const $ = <T extends HTMLElement>(id: string): T => box.querySelector<T>(`[data-id="${id}"]`)!;
  const sync = () => {
    $<HTMLInputElement>('picker-query').value = state.query;
    $<HTMLSelectElement>('picker-sort').value = state.sort;
    $<HTMLSelectElement>('picker-band').value = state.band;
    $<HTMLInputElement>('picker-cleared').checked = state.hideCleared;
    $('src-library').setAttribute('aria-pressed', String(!state.random));
    $('src-random').setAttribute('aria-pressed', String(state.random));
    $('picker-filters').hidden = state.random;
    // filters in use stay in view, so a short menu is never a mystery
    if (state.query || state.band !== 'all' || state.hideCleared || state.sort !== 'easy')
      $<HTMLDetailsElement>('picker-filters').open = true;
  };
  const changed = () => {
    sync();
    onChange();
  };
  $('src-library').addEventListener('click', () => {
    state.random = false;
    changed();
  });
  $('src-random').addEventListener('click', () => {
    state.random = true;
    changed();
  });
  $<HTMLInputElement>('picker-query').addEventListener('input', (e) => {
    state.query = (e.target as HTMLInputElement).value;
    onChange();
  });
  $<HTMLSelectElement>('picker-sort').addEventListener('change', (e) => {
    state.sort = (e.target as HTMLSelectElement).value as SongSort;
    changed();
  });
  $<HTMLSelectElement>('picker-band').addEventListener('change', (e) => {
    state.band = (e.target as HTMLSelectElement).value as Band;
    changed();
  });
  $<HTMLInputElement>('picker-cleared').addEventListener('change', (e) => {
    state.hideCleared = (e.target as HTMLInputElement).checked;
    changed();
  });
  sync();
  return { sync };
}

/**
 * Fills a song menu and chooses what is selected: `wanted` when it is on offer, else `fallback`,
 * else the first song. Returns true when the selection is not what it was before, so the caller can
 * tell the rest of the screen.
 */
export function rebuildPicker(
  select: HTMLSelectElement,
  fill: PickerFill,
  wanted: string | null,
  fallback: string | null,
): boolean {
  const before = select.value;
  fillPicker(select, fill);
  const has = (v: string | null): v is string =>
    v !== null && [...select.options].some((o) => o.value === v && !o.disabled);
  const first = [...select.options].find((o) => !o.disabled)?.value ?? '';
  select.value = has(wanted) ? wanted : has(fallback) ? fallback : first;
  return select.value !== before;
}
