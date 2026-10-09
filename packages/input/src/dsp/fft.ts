/** In-place iterative radix-2 FFT. `re`/`im` must have the same power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0 || im.length !== n)
    throw new Error('fft: length must be a power of two');
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Power spectrum (|X|^2) of the first n/2+1 bins of a real signal (zero-padded or truncated to `size`), Hann-windowed. */
export function powerSpectrum(samples: ArrayLike<number>, size: number): Float64Array {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const len = Math.min(samples.length, size);
  for (let i = 0; i < len; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, len - 1));
    re[i] = samples[i]! * w;
  }
  fft(re, im);
  const out = new Float64Array(size / 2 + 1);
  for (let k = 0; k < out.length; k++) out[k] = re[k]! * re[k]! + im[k]! * im[k]!;
  return out;
}
