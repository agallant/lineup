import { describe, expect, it } from 'vitest';
import { MIN_PX_PER_SEC, fitLookAhead } from './renderer';
import { computeLaneLayout } from './percussion-lanes';

describe('fitLookAhead', () => {
  it('keeps the preferred look-ahead on a wide screen', () => {
    expect(fitLookAhead(900, 4)).toBe(4);
  });

  it('shows less on a narrow phone so notes keep their room', () => {
    const seconds = fitLookAhead(270, 4);
    expect(seconds).toBeLessThan(4);
    expect(270 / seconds).toBeGreaterThanOrEqual(MIN_PX_PER_SEC);
  });

  it('never goes under its floor', () => {
    expect(fitLookAhead(50, 4, 2)).toBe(2);
  });
});

describe('lane layout on a phone', () => {
  it('spaces eighth notes at 120 bpm wider than a note', () => {
    const l = computeLaneLayout({ width: 358, height: 520 }, 1);
    expect(l.pxPerSec * 0.25).toBeGreaterThan(l.radius * 2);
  });
});
