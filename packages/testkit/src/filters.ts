/** A biquad filter (RBJ cookbook), for shaping noise into drum-like sounds. */
export interface Biquad {
  process(x: number): number;
}

function biquad(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number): Biquad {
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return {
    process(x) {
      const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      return y;
    },
  };
}

export function bandpass(hz: number, q: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  return biquad(alpha, 0, -alpha, 1 + alpha, -2 * Math.cos(w), 1 - alpha);
}

export function lowpass(hz: number, q: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return biquad((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}

export function highpass(hz: number, q: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  return biquad((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha);
}
