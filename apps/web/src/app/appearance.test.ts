import { describe, expect, it } from 'vitest';
import { TEXT_SCALE, applyTextSize, applyTheme } from './appearance';

describe('applyTextSize', () => {
  it('sets the scale the style sheet reads, larger for larger sizes', () => {
    const root = {
      style: {
        values: new Map<string, string>(),
        setProperty(k: string, v: string) {
          this.values.set(k, v);
        },
      },
    };
    applyTextSize('large', root as unknown as HTMLElement);
    expect(root.style.values.get('--text-scale')).toBe(String(TEXT_SCALE.large));
    expect(TEXT_SCALE.normal).toBeLessThan(TEXT_SCALE.large);
    expect(TEXT_SCALE.large).toBeLessThan(TEXT_SCALE.larger);
  });
});

describe('applyTheme', () => {
  it('sets the scheme the style sheet switches on', () => {
    const root = { dataset: {} as Record<string, string> };
    applyTheme('light', root as unknown as HTMLElement);
    expect(root.dataset['theme']).toBe('light');
  });
});
