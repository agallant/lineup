import { canonicalChordName, setChordPreferences, type ChordPreferences } from '@lineup/core';
import { safeLocalStorage } from './settings';

const KEY = 'lineup.chordprefs.v1';

type Prefs = Record<string, Record<string, (number | null)[]>>;

/** Reads the saved fingerings, keeping only well-formed ones (a fret number or null for each string). */
export function loadChordPrefs(storage: Pick<Storage, 'getItem'> | null): Prefs {
  const out: Prefs = { ukulele: {}, guitar: {} };
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? 'null') as unknown;
    if (!raw || typeof raw !== 'object') return out;
    for (const [instrument, strings] of [
      ['ukulele', 4],
      ['guitar', 6],
    ] as const) {
      const table = (raw as Record<string, unknown>)[instrument];
      if (!table || typeof table !== 'object') continue;
      for (const [chord, frets] of Object.entries(table)) {
        if (
          Array.isArray(frets) &&
          frets.length === strings &&
          frets.every((f) => f === null || (Number.isInteger(f) && f >= 0 && f <= 24))
        ) {
          out[instrument]![chord] = frets as (number | null)[];
        }
      }
    }
  } catch {
    // a damaged entry is the same as none
  }
  return out;
}

/** The fingerings in use this visit: kept here too, so a blocked or failing store does not lose earlier choices. */
let current: Prefs = { ukulele: {}, guitar: {} };

/** Saves one chosen fingering (or, with `frets` null, forgets it) and puts it to use at once. */
export function chooseFingering(
  instrument: 'ukulele' | 'guitar',
  chord: string,
  frets: readonly (number | null)[] | null,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage(),
): void {
  // what the device holds with this visit's choices over it (a blocked or failing store loses none)
  const stored = loadChordPrefs(storage);
  const prefs: Prefs = {
    ukulele: { ...stored['ukulele'], ...current['ukulele'] },
    guitar: { ...stored['guitar'], ...current['guitar'] },
  };
  // kept under the chord's one canonical name, so "Db" and "C#" are the same chord
  const name = canonicalChordName(chord) ?? chord;
  const table = Object.fromEntries(Object.entries(prefs[instrument]!).filter(([k]) => k !== name));
  if (frets !== null) table[name] = [...frets];
  prefs[instrument] = table;
  current = prefs;
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // storage blocked: the choice lasts for this visit only
  }
  setChordPreferences(prefs as ChordPreferences);
}

/** Puts the saved fingerings to use (once, when the app starts). */
export function applyStoredChordPrefs(
  storage: Pick<Storage, 'getItem'> | null = safeLocalStorage(),
): void {
  current = loadChordPrefs(storage);
  setChordPreferences(current as ChordPreferences);
}
