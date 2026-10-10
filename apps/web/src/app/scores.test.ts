import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { ScoreStore, describeBest, scoreKey } from './scores';

class Mem implements KeyValueStore {
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

const result = (score: number) => ({ score, accuracy: 0.9, grade: 'A' });
const KEY = scoreKey('voice', 'singline-scale', 'normal');

describe('scoreKey', () => {
  it('separates profile, song and variant', () => {
    expect(KEY).toBe('voice|singline-scale|normal');
    expect(scoreKey('clap', 'clap-basic')).toBe('clap|clap-basic|');
    expect(scoreKey('a', 'b', 'c')).not.toBe(scoreKey('a', 'b', 'd'));
  });
});

describe('ScoreStore', () => {
  it('has no best before anything is played', () => {
    expect(new ScoreStore(new Mem()).best(KEY)).toBeNull();
  });

  it('keeps the best, reports a new best, and ignores equal or lower scores', () => {
    const s = new ScoreStore(new Mem());
    expect(s.record(KEY, result(1000))).toMatchObject({ isNewBest: true, best: { score: 1000 } });
    expect(s.record(KEY, result(900))).toMatchObject({ isNewBest: false, best: { score: 1000 } });
    expect(s.record(KEY, result(1000)).isNewBest).toBe(false);
    expect(s.record(KEY, result(1500))).toMatchObject({ isNewBest: true, best: { score: 1500 } });
    expect(s.best(KEY)!.score).toBe(1500);
  });

  it('keeps a separate best for each variant', () => {
    const s = new ScoreStore(new Mem());
    s.record(scoreKey('voice', 'x', 'easy'), result(5000));
    expect(s.best(scoreKey('voice', 'x', 'strict'))).toBeNull();
  });

  it('stamps the time it was set', () => {
    const s = new ScoreStore(new Mem());
    expect(s.record(KEY, result(10), new Date('2026-10-10T01:02:03Z')).best.at).toBe(
      '2026-10-10T01:02:03.000Z',
    );
  });

  it('persists across instances', () => {
    const mem = new Mem();
    new ScoreStore(mem).record(KEY, result(777));
    expect(new ScoreStore(mem).best(KEY)).toMatchObject({ score: 777, grade: 'A' });
  });

  it('survives corrupt or hostile stored data', () => {
    const mem = new Mem();
    mem.setItem('lineup.scores.v1', 'not json');
    expect(new ScoreStore(mem).best(KEY)).toBeNull();
    mem.setItem(
      'lineup.scores.v1',
      JSON.stringify({ [KEY]: { score: 'lots' }, ok: result(5), bad: 7 }),
    );
    const s = new ScoreStore(mem);
    expect(s.best(KEY)).toBeNull();
    expect(s.best('bad')).toBeNull();
    expect(s.best('ok')).toBeNull(); // missing "at": dropped rather than half-trusted
    mem.setItem('lineup.scores.v1', JSON.stringify([1, 2]));
    expect(new ScoreStore(mem).best('0')).toBeNull();
  });

  it('does not treat Object.prototype names as scores', () => {
    const s = new ScoreStore(new Mem());
    for (const k of ['constructor', 'toString', '__proto__']) expect(s.best(k)).toBeNull();
  });

  it('keeps working when storage is missing or throws', () => {
    const none = new ScoreStore(null);
    expect(none.record(KEY, result(5)).isNewBest).toBe(true);
    expect(none.best(KEY)!.score).toBe(5);
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const s = new ScoreStore(throwing);
    expect(s.record(KEY, result(9)).isNewBest).toBe(true);
    s.clear();
    expect(s.best(KEY)).toBeNull();
  });

  it('drops the oldest entries past the cap', () => {
    const s = new ScoreStore(new Mem());
    for (let i = 0; i < 320; i++) s.record(scoreKey('p', `song${i}`), result(i + 1));
    expect(s.best(scoreKey('p', 'song0'))).toBeNull();
    expect(s.best(scoreKey('p', 'song319'))).not.toBeNull();
  });

  it('clear forgets everything', () => {
    const mem = new Mem();
    const s = new ScoreStore(mem);
    s.record(KEY, result(100));
    s.clear();
    expect(s.best(KEY)).toBeNull();
    expect(new ScoreStore(mem).best(KEY)).toBeNull();
  });
});

describe('describeBest', () => {
  it('words a best and the lack of one', () => {
    expect(describeBest({ score: 12345, accuracy: 0.876, grade: 'B', at: 'x' })).toBe(
      'Best: 12,345 (B, 88%)',
    );
    expect(describeBest(null)).toMatch(/No score yet/);
  });
});

describe('ScoreStore across tabs and bad data', () => {
  it('does not erase a score another tab saved since this one loaded', () => {
    const mem = new Mem();
    const tabA = new ScoreStore(mem);
    const tabB = new ScoreStore(mem); // both loaded before anything was played
    tabA.record(KEY, result(500));
    tabB.record(scoreKey('voice', 'other-song', 'normal'), result(300));
    const fresh = new ScoreStore(mem);
    expect(fresh.best(KEY)?.score).toBe(500);
    expect(fresh.best(scoreKey('voice', 'other-song', 'normal'))?.score).toBe(300);
  });

  it('keeps the higher score when both tabs played the same song', () => {
    const mem = new Mem();
    const tabA = new ScoreStore(mem);
    const tabB = new ScoreStore(mem);
    tabA.record(KEY, result(900));
    expect(tabB.record(KEY, result(400)).isNewBest).toBe(false);
    expect(new ScoreStore(mem).best(KEY)?.score).toBe(900);
  });

  it('ignores stored records outside the scoring bounds', () => {
    const mem = new Mem();
    const rec = (score: number, accuracy: number) => ({ score, accuracy, grade: 'A', at: 'x' });
    mem.setItem(
      'lineup.scores.v1',
      JSON.stringify({
        ok: rec(1200, 0.9),
        accuracyTooHigh: rec(1200, 2),
        negativeAccuracy: rec(1200, -0.1),
        negativeScore: rec(-5, 0.5),
        absurdScore: rec(1e12, 0.5),
      }),
    );
    const store = new ScoreStore(mem);
    expect(store.best('ok')?.score).toBe(1200);
    for (const k of ['accuracyTooHigh', 'negativeAccuracy', 'negativeScore', 'absurdScore']) {
      expect(store.best(k)).toBeNull();
    }
  });
});
