import { describe, expect, it } from 'vitest';
import { TIPS, TourStore } from './tour';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('tour', () => {
  it('has short tips for each game', () => {
    expect(Object.keys(TIPS).sort()).toEqual([
      'bassline',
      'beatline',
      'keyline',
      'singline',
      'strumline',
      'windline',
    ]);
    for (const tip of Object.values(TIPS)) {
      expect(tip.steps.length).toBeLessThanOrEqual(3);
      for (const s of tip.steps) expect(s.length).toBeLessThan(140);
    }
  });

  it('shows a game once, then not again, and remembers across a reload', () => {
    const mem = new Mem();
    const t = new TourStore(mem);
    expect(t.pending('singline')).toBe(true);
    t.dismiss('singline');
    expect(t.pending('singline')).toBe(false);
    expect(t.pending('windline')).toBe(true);
    expect(new TourStore(mem).pending('singline')).toBe(false);
    expect(t.pending('no-such-game')).toBe(false);
  });

  it('copes with corrupt or missing storage', () => {
    const mem = new Mem();
    mem.setItem('lineup.tour.v1', '{broken');
    expect(new TourStore(mem).pending('singline')).toBe(true);
    mem.setItem('lineup.tour.v1', '[1,"singline",null]');
    expect(new TourStore(mem).pending('singline')).toBe(false);
    expect(new TourStore(null).pending('singline')).toBe(true);
    expect(() => new TourStore(null).dismiss('singline')).not.toThrow();
  });
});
