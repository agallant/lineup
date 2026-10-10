/** A random source: each call returns a number in [0, 1). */
export type Rng = () => number;

/**
 * A small seeded generator (mulberry32). The same seed always gives the same sequence, which is
 * what lets a generated challenge be shown as a number, replayed and shared.
 */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit seed from any text (FNV-1a), for turning a typed word into a challenge. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One item, uniformly. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: nothing to choose from');
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/** One item, chosen in proportion to its weight (weights of 0 or less are never chosen). */
export function pickWeighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T {
  const total = items.reduce((sum, i) => sum + Math.max(0, i.weight), 0);
  if (total <= 0) throw new Error('pickWeighted: no item has a positive weight');
  let at = rng() * total;
  for (const { item, weight } of items) {
    at -= Math.max(0, weight);
    if (at < 0) return item;
  }
  return items[items.length - 1]!.item; // rounding at the very end of the range
}

/** True with the given probability. */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}
