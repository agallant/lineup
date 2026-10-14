import { describe, expect, it } from 'vitest';
import { LADDER_RUNGS, LadderStore, ladderText, rungFor } from './ladder';

class Mem {
  private m = new Map<string, string>();
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

describe('tempo ladder', () => {
  it('counts a speed for the highest rung it reaches, and nothing below the lowest', () => {
    expect(rungFor(0.5)).toBeNull();
    expect(rungFor(0.65)).toBe(0.65);
    expect(rungFor(0.8)).toBe(0.8);
    expect(rungFor(1)).toBe(1);
    expect(rungFor(1.2)).toBe(1);
  });

  it('climbs rung by rung with clean runs and says when it is done', () => {
    const l = new LadderStore(new Mem());
    const k = 'wind|wind-ode';
    expect(l.status(k)).toMatchObject({ cleared: [], next: 0.65, complete: false });
    expect(l.record(k, 0.65, 0.95)).toMatchObject({ newRung: true, next: 0.8, complete: false });
    // a repeat of the same rung, or a messy run, changes nothing
    expect(l.record(k, 0.65, 0.99).newRung).toBe(false);
    expect(l.record(k, 0.8, 0.5).newRung).toBe(false);
    // speeds off the ladder do not count
    expect(l.record(k, 0.5, 1).newRung).toBe(false);
    expect(l.record(k, 1, 1).newRung).toBe(false); // the top before the middle: not yet
    expect(l.record(k, 0.8, 0.9).cleared).toEqual([0.65, 0.8]);
    const top = l.record(k, 1, 1);
    expect(top).toMatchObject({ next: null, complete: true, justCompleted: true });
    expect(l.record(k, 1, 1).justCompleted).toBe(false);
    expect(l.cleared(k)).toEqual([...LADDER_RUNGS]);
  });

  it('keeps each song separately, survives a reload and ignores junk', () => {
    const mem = new Mem();
    new LadderStore(mem).record('a', 0.65, 1);
    expect(new LadderStore(mem).cleared('a')).toEqual([0.65]);
    expect(new LadderStore(mem).cleared('b')).toEqual([]);
    mem.setItem('lineup.ladder.v1', JSON.stringify({ a: [0.3, 'x', 0.8], b: 'no', c: [] }));
    const l = new LadderStore(mem);
    expect(l.cleared('a')).toEqual([0.8]);
    expect(l.cleared('b')).toEqual([]);
    mem.setItem('lineup.ladder.v1', '{not json');
    expect(new LadderStore(mem).cleared('a')).toEqual([]);
    // without storage the climb still works, in memory
    const memory = new LadderStore(null);
    expect(memory.record('a', 0.65, 1).newRung).toBe(true);
    expect(memory.record('a', 0.8, 1).cleared).toEqual([0.65, 0.8]);
  });

  it('writes the ladder as text', () => {
    expect(ladderText([0.65, 0.8])).toBe('65% ✓ · 80% ✓ · 100%');
  });
});
