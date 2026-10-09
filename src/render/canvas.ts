/**
 * Sizes a canvas's backing store to its CSS size times devicePixelRatio and
 * returns a context scaled so drawing uses CSS pixels. Call on resize.
 */
export function fitCanvas(canvas: HTMLCanvasElement): {
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
} {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unsupported');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, width, height };
}
