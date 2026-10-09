import { describe, expect, it } from 'vitest';
import { fft, powerSpectrum } from './fft';

function naiveDft(x: number[]): { re: number[]; im: number[] } {
  const n = x.length;
  const re: number[] = [];
  const im: number[] = [];
  for (let k = 0; k < n; k++) {
    let r = 0;
    let i = 0;
    for (let t = 0; t < n; t++) {
      const a = (-2 * Math.PI * k * t) / n;
      r += x[t]! * Math.cos(a);
      i += x[t]! * Math.sin(a);
    }
    re.push(r);
    im.push(i);
  }
  return { re, im };
}

describe('fft', () => {
  it('matches a naive DFT on arbitrary input', () => {
    const x = Array.from(
      { length: 64 },
      (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1) + ((i * 37) % 11) / 11,
    );
    const re = Float64Array.from(x);
    const im = new Float64Array(64);
    fft(re, im);
    const ref = naiveDft(x);
    for (let k = 0; k < 64; k++) {
      expect(re[k]).toBeCloseTo(ref.re[k]!, 9);
      expect(im[k]).toBeCloseTo(ref.im[k]!, 9);
    }
  });

  it('puts a sine at its bin', () => {
    const n = 1024;
    const re = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 50 * i) / n));
    const im = new Float64Array(n);
    fft(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]!));
    expect(mags.indexOf(Math.max(...mags.slice(0, n / 2)))).toBe(50);
    expect(mags[50]).toBeCloseTo(n / 2, 6);
  });

  it('rejects lengths that are not a power of two', () => {
    expect(() => fft(new Float64Array(100), new Float64Array(100))).toThrow(/power of two/);
    expect(() => fft(new Float64Array(0), new Float64Array(0))).toThrow();
    expect(() => fft(new Float64Array(8), new Float64Array(4))).toThrow();
  });

  it('powerSpectrum peaks at the right frequency and zero-pads short input', () => {
    const sr = 48000;
    const sig = Float32Array.from({ length: 1000 }, (_, i) =>
      Math.sin((2 * Math.PI * 3000 * i) / sr),
    );
    const p = powerSpectrum(sig, 2048);
    expect(p).toHaveLength(1025);
    const peak = p.indexOf(Math.max(...p));
    expect((peak * sr) / 2048).toBeGreaterThan(2950);
    expect((peak * sr) / 2048).toBeLessThan(3050);
  });
});
