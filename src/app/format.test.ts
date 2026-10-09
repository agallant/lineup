import { describe, expect, it } from 'vitest';
import { formatCents, formatDb, formatMs } from './format';

describe('format', () => {
  it('formats latencies', () => {
    expect(formatMs(0.0053)).toBe('5.3 ms');
    expect(formatMs(undefined)).toBe('n/a');
    expect(formatMs(NaN)).toBe('n/a');
  });

  it('formats levels', () => {
    expect(formatDb(-12.34)).toBe('-12.3 dB');
    expect(formatDb(-120)).toBe('-∞ dB');
  });

  it('formats cents with a sign', () => {
    expect(formatCents(12.4)).toBe('+12¢');
    expect(formatCents(-7.6)).toBe('−8¢');
    expect(formatCents(0.2)).toBe('±0¢');
  });
});
