/**
 * Latency calibration. The player taps/claps/strums along to a click track;
 * the offset between each click and the response is measured on the same clock
 * and the median is the offset the judge subtracts from every input.
 *
 * The offset includes output latency, input latency AND the player's habitual
 * lead or lag, which is exactly what we want to cancel.
 */

export interface OffsetOptions {
  /** Ignore this many clicks at the start (people haven't locked in yet). */
  skipFirst?: number;
  /** A response farther than this (seconds) from every click is not a response to it. */
  maxResidual?: number;
  /** Need at least this many matched responses. */
  minUsed?: number;
}

export type CalibrationQuality = 'good' | 'ok' | 'poor';

export interface OffsetEstimate {
  ok: true;
  /** Seconds. Positive = responses land after the click (judge subtracts it). */
  offset: number;
  /** Responses matched to clicks, before outlier rejection. */
  matched: number;
  /** Responses kept after outlier rejection. */
  used: number;
  /** Robust spread (scaled MAD) in seconds. */
  spread: number;
  quality: CalibrationQuality;
}

export interface OffsetFailure {
  ok: false;
  reason: string;
}

const MAD_TO_SIGMA = 1.4826;

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function estimateOffset(
  clicks: readonly number[],
  responses: readonly number[],
  { skipFirst = 2, maxResidual = 0.25, minUsed = 4 }: OffsetOptions = {},
): OffsetEstimate | OffsetFailure {
  const usableClicks = clicks.slice(skipFirst);
  if (usableClicks.length === 0) return { ok: false, reason: 'No clicks to compare against.' };

  // Each click claims at most one response: the nearest one within range.
  const best = new Map<number, number>(); // click index -> residual
  for (const r of responses) {
    let ci = -1;
    let cd = Infinity;
    usableClicks.forEach((c, i) => {
      const d = Math.abs(r - c);
      if (d < cd) {
        cd = d;
        ci = i;
      }
    });
    if (ci < 0 || cd > maxResidual) continue;
    const residual = r - usableClicks[ci]!;
    const prev = best.get(ci);
    if (prev === undefined || Math.abs(residual) < Math.abs(prev)) best.set(ci, residual);
  }
  const residuals = [...best.values()];
  const matched = residuals.length;
  if (matched < minUsed) {
    return {
      ok: false,
      reason: `Only ${matched} of ${usableClicks.length} responses were heard. Try again a bit louder, in a quieter spot.`,
    };
  }

  // Reject outliers beyond 3 robust sigmas (floor 5 ms so a very tight set isn't over-trimmed).
  const m0 = median(residuals);
  const sigma0 = Math.max(MAD_TO_SIGMA * median(residuals.map((r) => Math.abs(r - m0))), 0.005);
  const kept = residuals.filter((r) => Math.abs(r - m0) <= 3 * sigma0);
  if (kept.length < minUsed) {
    return {
      ok: false,
      reason: 'Your timing was too uneven to measure. Try again, tapping steadily with the clicks.',
    };
  }
  const offset = median(kept);
  const spread = MAD_TO_SIGMA * median(kept.map((r) => Math.abs(r - offset)));
  const quality: CalibrationQuality =
    kept.length >= 8 && spread < 0.025 ? 'good' : kept.length >= 6 && spread < 0.05 ? 'ok' : 'poor';
  return { ok: true, offset, matched, used: kept.length, spread, quality };
}

/** Fallback before the player has calibrated: whatever the browser reports. */
export function defaultOffsetFromLatencies(info: {
  baseLatency?: number | undefined;
  outputLatency?: number | undefined;
}): number {
  const v = (info.baseLatency ?? 0) + (info.outputLatency ?? 0);
  return Number.isFinite(v) ? Math.min(Math.max(v, 0), 0.5) : 0;
}

// ---- persistence ----------------------------------------------------------

/** The subset of Storage we need, so core stays DOM-free. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CalibrationRecord {
  version: 1;
  /** Milliseconds. */
  offsetMs: number;
  /** ISO timestamp. */
  measuredAt: string;
  used: number;
  spreadMs: number;
  quality: CalibrationQuality;
}

export function recordFromEstimate(e: OffsetEstimate, now: Date = new Date()): CalibrationRecord {
  return {
    version: 1,
    offsetMs: Math.round(e.offset * 10000) / 10,
    measuredAt: now.toISOString(),
    used: e.used,
    spreadMs: Math.round(e.spread * 10000) / 10,
    quality: e.quality,
  };
}

function isRecord(v: unknown): v is CalibrationRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r['version'] === 1 &&
    typeof r['offsetMs'] === 'number' &&
    Number.isFinite(r['offsetMs']) &&
    Math.abs(r['offsetMs']) <= 1000 &&
    typeof r['measuredAt'] === 'string' &&
    typeof r['used'] === 'number' &&
    typeof r['spreadMs'] === 'number' &&
    (r['quality'] === 'good' || r['quality'] === 'ok' || r['quality'] === 'poor')
  );
}

/**
 * Persists calibration per device. Storage can be missing, full, or blocked
 * (private windows), so every access is guarded and failure just means "not
 * calibrated yet".
 */
export class CalibrationStore {
  constructor(
    private readonly store: KeyValueStore | null,
    private readonly prefix = 'lineup.calibration.v1',
  ) {}

  private key(deviceKey: string): string {
    return `${this.prefix}:${deviceKey}`;
  }

  load(deviceKey = 'default'): CalibrationRecord | null {
    try {
      const text = this.store?.getItem(this.key(deviceKey));
      if (!text) return null;
      const parsed: unknown = JSON.parse(text);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /** Returns whether it was actually saved. */
  save(record: CalibrationRecord, deviceKey = 'default'): boolean {
    try {
      if (!this.store) return false;
      this.store.setItem(this.key(deviceKey), JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }
}
