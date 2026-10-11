/** The parts of localStorage a backup needs. */
export interface EnumerableStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = 'lineup.';
/** Things the app keeps only to test that storage works. */
const SKIP = new Set(['lineup.probe']);
const MAX_BYTES = 2_000_000;

/** The keys the app owns in a store. */
export function lineupKeys(store: EnumerableStore): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k !== null && k.startsWith(PREFIX) && !SKIP.has(k)) keys.push(k);
  }
  return keys.sort();
}

/**
 * Everything the app keeps on this device (settings, best scores, progress, timing calibration,
 * your trained sounds) as one JSON text, to save as a private backup file or move to another device.
 */
export function exportBackup(store: EnumerableStore, now = new Date()): string {
  const data: Record<string, string> = {};
  for (const k of lineupKeys(store)) {
    const v = store.getItem(k);
    if (v !== null) data[k] = v;
  }
  return JSON.stringify({ lineup: 'backup', version: 1, at: now.toISOString(), data }, null, 2);
}

/**
 * Restores a backup made by {@link exportBackup}, replacing what the app keeps now. Returns how
 * many items were restored; null (nothing changed) if the text is not a backup or storage refused it;
 * or 'incomplete' if storage refused a write and the old data could not all be put back.
 */
export function importBackup(store: EnumerableStore, text: string): number | null | 'incomplete' {
  if (text.length > MAX_BYTES) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r['lineup'] !== 'backup' || typeof r['data'] !== 'object' || r['data'] === null) return null;
  const entries = Object.entries(r['data'] as Record<string, unknown>).filter(
    (e): e is [string, string] =>
      e[0].startsWith(PREFIX) && !SKIP.has(e[0]) && typeof e[1] === 'string',
  );
  // a file with nothing usable in it must not wipe what is there
  if (entries.length === 0) return null;
  // snapshot first: if even reading fails, nothing has been touched
  let previous: (readonly [string, string | null])[];
  try {
    previous = lineupKeys(store).map((k) => [k, store.getItem(k)] as const);
  } catch {
    return null;
  }
  try {
    for (const [k] of previous) store.removeItem(k);
    for (const [k, v] of entries) store.setItem(k, v);
  } catch {
    // storage refused a write (full?): put back exactly what was there, key by key, so one
    // failure does not stop the rest from being restored
    let incomplete = false;
    try {
      for (const k of lineupKeys(store)) store.removeItem(k);
    } catch {
      incomplete = true;
    }
    for (const [k, v] of previous) {
      if (v === null) continue;
      try {
        store.setItem(k, v);
      } catch {
        incomplete = true;
      }
    }
    return incomplete ? 'incomplete' : null;
  }
  return entries.length;
}
