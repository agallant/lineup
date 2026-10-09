import { fitCanvas } from './canvas';

const BG = '#1f1c30';
const GRID = '#3b3656';

/** Oscilloscope view of a block of samples in [-1, 1]. */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: Float32Array,
  color: string,
): void {
  const { g, width, height } = fitCanvas(canvas);
  g.fillStyle = BG;
  g.fillRect(0, 0, width, height);
  g.strokeStyle = GRID;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, height / 2);
  g.lineTo(width, height / 2);
  g.stroke();

  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  const step = samples.length / width;
  for (let x = 0; x < width; x++) {
    // Draw the min..max of the samples under each pixel so peaks aren't lost.
    let lo = 1;
    let hi = -1;
    const end = Math.min(samples.length, Math.floor((x + 1) * step));
    for (let i = Math.floor(x * step); i < end; i++) {
      const v = samples[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) continue;
    g.moveTo(x + 0.5, height / 2 - hi * (height / 2));
    g.lineTo(x + 0.5, height / 2 - lo * (height / 2) + 1);
  }
  g.stroke();
}

export const METER_FLOOR_DB = -72;

/** Horizontal level meter: RMS bar plus a peak tick, -72..0 dBFS. */
export function drawMeter(
  canvas: HTMLCanvasElement,
  rmsDb: number,
  peakDb: number,
  colors: { bar: string; peak: string; hot: string },
): void {
  const { g, width, height } = fitCanvas(canvas);
  const x = (db: number) =>
    width * Math.min(1, Math.max(0, (db - METER_FLOOR_DB) / -METER_FLOOR_DB));
  g.fillStyle = BG;
  g.fillRect(0, 0, width, height);
  g.fillStyle = rmsDb > -6 ? colors.hot : colors.bar;
  g.fillRect(0, 0, x(rmsDb), height);
  g.fillStyle = peakDb > -1 ? colors.hot : colors.peak;
  g.fillRect(x(peakDb) - 1.5, 0, 3, height);
  g.fillStyle = GRID;
  for (let db = METER_FLOOR_DB; db <= 0; db += 12) g.fillRect(x(db), height - 6, 1, 6);
}
