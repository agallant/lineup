/** Floor used instead of -Infinity for silence. */
export const MIN_DB = -120;

export function toDb(amplitude: number): number {
  return amplitude > 0 ? Math.max(MIN_DB, 20 * Math.log10(amplitude)) : MIN_DB;
}

export function rms(samples: ArrayLike<number>, start = 0, end = samples.length): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / (end - start));
}

export function peak(samples: ArrayLike<number>, start = 0, end = samples.length): number {
  let max = 0;
  for (let i = start; i < end; i++) max = Math.max(max, Math.abs(samples[i]!));
  return max;
}
