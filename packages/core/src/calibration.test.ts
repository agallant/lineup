import { describe, expect, it } from 'vitest';
import {
  CalibrationStore,
  defaultOffsetFromLatencies,
  detectClickBleed,
  estimateOffset,
  recordFromEstimate,
  type KeyValueStore,
} from './calibration';

/** Small deterministic PRNG, [-1, 1). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

const clicks = (n: number, start = 1, interval = 0.5) =>
  Array.from({ length: n }, (_, i) => start + i * interval);

describe('estimateOffset', () => {
  it('recovers a constant latency exactly', () => {
    const c = clicks(12);
    const r = estimateOffset(
      c,
      c.map((t) => t + 0.083),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offset).toBeCloseTo(0.083, 9);
    expect(r.spread).toBeCloseTo(0, 9);
    expect(r.quality).toBe('good');
    expect(r.used).toBe(10); // first two clicks skipped
  });

  it.each([
    ['output+input latency of 140 ms', 0.14],
    ['an early player (anticipates by 30 ms)', -0.03],
    ['no latency', 0],
  ])('recovers %s with realistic jitter', (_name, latency) => {
    const r1 = rng(7);
    const c = clicks(16);
    const resp = c.map((t) => t + latency + r1() * 0.015); // ±15 ms uniform
    const r = estimateOffset(c, resp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(r.offset - latency)).toBeLessThan(0.008);
    expect(r.quality).toBe('good');
  });

  it('ignores a couple of wild taps and extra stray hits', () => {
    const c = clicks(14);
    const resp = c.map((t) => t + 0.1);
    resp[6] = c[6]! + 0.2; // late outlier, still within range
    resp[9] = c[9]! - 0.2;
    resp.push(c[4]! + 0.25); // a double tap near click 4 (farther than the real one: ignored)
    const r = estimateOffset(
      c,
      resp.sort((a, b) => a - b),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offset).toBeCloseTo(0.1, 3);
    expect(r.used).toBeLessThan(r.matched);
  });

  it('rejects moderate outliers (40 ms off a tight cluster) but keeps the cluster', () => {
    const c = clicks(14);
    const r1 = rng(5);
    const resp = c.map((t) => t + 0.1 + r1() * 0.003);
    resp[5] = c[5]! + 0.14;
    resp[8] = c[8]! + 0.06;
    const r = estimateOffset(c, resp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.matched).toBe(12);
    expect(r.used).toBe(10);
    expect(r.offset).toBeCloseTo(0.1, 2);
  });

  it('ignores responses nowhere near a click', () => {
    const c = clicks(10);
    const r = estimateOffset(c, [...c.map((t) => t + 0.05), 99, 100, 101]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.offset).toBeCloseTo(0.05, 9);
  });

  it('fails helpfully when too few responses were heard', () => {
    const c = clicks(12);
    const r = estimateOffset(c, [c[5]! + 0.05, c[6]! + 0.05]);
    expect(r).toEqual({
      ok: false,
      reason: 'Only 2 of 10 responses were heard. Try again a bit louder, in a quieter spot.',
    });
  });

  it('fails when timing is too erratic to trust', () => {
    const c = clicks(14);
    const resp = c.map((t, i) => t + (i % 2 ? 0.22 : -0.22) + 0.001 * i);
    const r = estimateOffset(c, resp);
    // Two tight clusters ±0.22: median sits between, spread huge -> poor or failure, never "good"
    if (r.ok) expect(r.quality).toBe('poor');
    else expect(r.reason).toMatch(/uneven|heard/);
  });

  it('rates sloppy-but-usable timing as poor/ok rather than good', () => {
    const r2 = rng(3);
    const c = clicks(14);
    const r = estimateOffset(
      c,
      c.map((t) => t + 0.05 + r2() * 0.09),
    ); // ±90 ms
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.quality).not.toBe('good');
  });

  it('refuses when there are no clicks past the warm-up', () => {
    expect(estimateOffset([1, 2], [1, 2])).toEqual({
      ok: false,
      reason: 'No clicks to compare against.',
    });
  });
});

describe('defaultOffsetFromLatencies', () => {
  it.each([
    [{ baseLatency: 0.01, outputLatency: 0.03 }, 0.04],
    [{ baseLatency: 0.01 }, 0.01],
    [{}, 0],
    [{ outputLatency: 9 }, 0.5],
    [{ baseLatency: NaN }, 0],
  ])('%j -> %d', (info, expected) => {
    expect(defaultOffsetFromLatencies(info)).toBeCloseTo(expected, 9);
  });
});

class MemoryStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('CalibrationStore', () => {
  const est = estimateOffset(
    clicks(12),
    clicks(12).map((t) => t + 0.0834),
  );
  if (!est.ok) throw new Error('fixture');
  const record = recordFromEstimate(est, new Date('2026-10-09T12:00:00Z'));

  it('builds a rounded record', () => {
    expect(record).toEqual({
      version: 1,
      offsetMs: 83.4,
      measuredAt: '2026-10-09T12:00:00.000Z',
      used: 10,
      spreadMs: 0,
      quality: 'good',
    });
  });

  it('round-trips per device', () => {
    const s = new CalibrationStore(new MemoryStore());
    expect(s.load('mic-a')).toBeNull();
    expect(s.save(record, 'mic-a')).toBe(true);
    expect(s.load('mic-a')).toEqual(record);
    expect(s.load('mic-b')).toBeNull();
  });

  it('clear forgets one device and leaves the others', () => {
    const s = new CalibrationStore(new MemoryStore());
    s.save(record, 'a');
    s.save(record, 'b');
    expect(s.clear('a')).toBe(true);
    expect(s.load('a')).toBeNull();
    expect(s.load('b')).toEqual(record);
  });

  it('treats corrupt or out-of-range data as not calibrated', () => {
    const mem = new MemoryStore();
    const s = new CalibrationStore(mem);
    for (const bad of [
      'not json',
      '{}',
      '[]',
      JSON.stringify({ ...record, offsetMs: 5000 }),
      JSON.stringify({ ...record, version: 2 }),
      JSON.stringify({ ...record, quality: 'great' }),
    ]) {
      mem.setItem('lineup.calibration.v1:default', bad);
      expect(s.load()).toBeNull();
    }
  });

  it('survives storage that throws (private windows) or is missing', () => {
    const throwing: KeyValueStore = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    const s = new CalibrationStore(throwing);
    expect(s.load()).toBeNull();
    expect(s.save(record)).toBe(false);
    expect(s.clear()).toBe(false);
    const none = new CalibrationStore(null);
    expect(none.load()).toBeNull();
    expect(none.save(record)).toBe(false);
    expect(none.clear()).toBe(false);
  });
});

describe('detectClickBleed', () => {
  const c = clicks(6);
  it('flags onsets sitting on the clicks (speaker leaking into the mic)', () => {
    expect(
      detectClickBleed(
        c,
        c.map((t) => t + 0.03),
      ),
    ).toBe(true);
  });
  it('passes a quiet room', () => {
    expect(detectClickBleed(c, [])).toBe(false);
  });
  it('ignores onsets that are not near the clicks', () => {
    expect(
      detectClickBleed(
        c,
        c.map((t) => t + 0.25),
      ),
    ).toBe(false);
  });
  it('needs at least half the clicks (default) to flag', () => {
    expect(
      detectClickBleed(
        c,
        c.slice(0, 3).map((t) => t + 0.02),
      ),
    ).toBe(true);
    expect(
      detectClickBleed(
        c,
        c.slice(0, 2).map((t) => t + 0.02),
      ),
    ).toBe(false);
  });
  it('no clicks, no bleed', () => {
    expect(detectClickBleed([], [1, 2])).toBe(false);
  });
});
