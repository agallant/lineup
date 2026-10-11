import type { Chart } from '../chart';
import { rateChart } from '../difficulty';
import { MAX_SEED } from './melody';

/** How many random songs are tried when looking for one near a target difficulty. */
const TRIES = 150;

/**
 * A seed whose song rates as close as it can to `target` (1 to 10), found by trying random seeds:
 * the first exact match, else the nearest of the tries. `build` makes the song for a seed; `random`
 * is where the seeds come from (a seeded generator makes the search repeatable).
 */
export function seedForDifficulty(
  build: (seed: number) => Chart,
  target: number,
  random: () => number = Math.random,
  tries = TRIES,
): number {
  let best = Math.floor(random() * (MAX_SEED + 1));
  let bestGap = Infinity;
  for (let i = 0; i < tries; i++) {
    const seed = i === 0 ? best : Math.floor(random() * (MAX_SEED + 1));
    const gap = Math.abs(rateChart(build(seed)).score - target);
    if (gap < bestGap) {
      best = seed;
      bestGap = gap;
      if (gap === 0) break;
    }
  }
  return best;
}
