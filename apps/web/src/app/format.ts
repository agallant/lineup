/** Seconds -> "12.3 ms", or "n/a" when the browser doesn't report it. */
export function formatMs(seconds: number | undefined | null): string {
  if (seconds === undefined || seconds === null || !Number.isFinite(seconds)) return 'n/a';
  return `${(seconds * 1000).toFixed(1)} ms`;
}

export function formatDb(db: number): string {
  return db <= -120 ? '-∞ dB' : `${db.toFixed(1)} dB`;
}

export function formatCents(cents: number): string {
  const r = Math.round(cents);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)}¢`;
}
