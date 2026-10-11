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
 * many items were restored, or null (nothing changed) if the text is not a backup or storage refused it.
 */
export function importBackup(store: EnumerableStore, text: string): number | null {
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
  const previous = lineupKeys(store).map((k) => [k, store.getItem(k)] as const);
  try {
    for (const [k] of previous) store.removeItem(k);
    for (const [k, v] of entries) store.setItem(k, v);
  } catch {
    // storage refused a write (full?): put back exactly what was there
    try {
      for (const k of lineupKeys(store)) store.removeItem(k);
      for (const [k, v] of previous) if (v !== null) store.setItem(k, v);
    } catch {
      // nothing more can be done
    }
    return null;
  }
  return entries.length;
}
