import { describe, expect, it } from 'vitest';
import { exportBackup, importBackup, lineupKeys, type EnumerableStore } from './backup';

class Mem implements EnumerableStore {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
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

describe('backup when storage refuses a write', () => {
  it('puts back what was there and says it failed', () => {
    class Full extends Mem {
      override setItem(k: string, v: string) {
        if (k === 'lineup.c') throw new Error('QuotaExceededError'); // the third write is refused
        super.setItem(k, v);
      }
    }
    const m = new Full();
    m.data.set('lineup.settings.v1', 'mine');
    m.data.set('lineup.scores.v1', 'also mine');
    const text = JSON.stringify({
      lineup: 'backup',
      data: { 'lineup.a': '1', 'lineup.b': '2', 'lineup.c': '3' },
    });
    expect(importBackup(m, text)).toBeNull();
    expect(m.getItem('lineup.settings.v1')).toBe('mine');
    expect(m.getItem('lineup.scores.v1')).toBe('also mine');
    expect(m.getItem('lineup.a')).toBeNull();
  });
});

describe('backup when storage cannot even be read or put back', () => {
  it('changes nothing if reading fails, and says so if the rollback is incomplete', () => {
    class Unreadable extends Mem {
      override getItem(k: string): string | null {
        if (k.startsWith('lineup.')) throw new Error('SecurityError');
        return super.getItem(k);
      }
    }
    const u = new Unreadable();
    u.data.set('lineup.settings.v1', 'mine');
    const text = JSON.stringify({ lineup: 'backup', data: { 'lineup.a': '1' } });
    expect(importBackup(u, text)).toBeNull();
    expect(u.data.get('lineup.settings.v1')).toBe('mine'); // untouched

    class Broken extends Mem {
      fail = false;
      override setItem(k: string, v: string) {
        if (this.fail) throw new Error('QuotaExceededError');
        super.setItem(k, v);
      }
      override removeItem(k: string) {
        super.removeItem(k);
        this.fail = true; // from now on every write is refused, including the rollback
      }
    }
    const b = new Broken();
    b.data.set('lineup.settings.v1', 'mine');
    expect(importBackup(b, text)).toBe('incomplete');
  });
});

describe('backup', () => {
  it('lists only the app keys', () => {
    const m = new Mem();
    m.setItem('lineup.settings.v1', '{}');
    m.setItem('lineup.probe', '1');
    m.setItem('other.site', 'x');
    expect(lineupKeys(m)).toEqual(['lineup.settings.v1']);
  });

  it('round-trips what the app keeps and leaves other data alone', () => {
    const a = new Mem();
    a.setItem('lineup.settings.v1', '{"debug":true}');
    a.setItem('lineup.scores.v1', '{"a":1}');
    a.setItem('other.site', 'x');
    const text = exportBackup(a, new Date('2026-10-11T00:00:00Z'));
    expect(JSON.parse(text)).toMatchObject({ lineup: 'backup', at: '2026-10-11T00:00:00.000Z' });
    expect(text).not.toContain('other.site');

    const b = new Mem();
    b.setItem('lineup.progress.v1', 'old');
    b.setItem('other.site', 'keep');
    expect(importBackup(b, text)).toBe(2);
    expect(b.getItem('lineup.settings.v1')).toBe('{"debug":true}');
    expect(b.getItem('lineup.progress.v1')).toBeNull(); // replaced, not merged
    expect(b.getItem('other.site')).toBe('keep');
  });

  it('refuses a backup with nothing usable in it, leaving the data alone', () => {
    const m = new Mem();
    m.setItem('lineup.settings.v1', 'mine');
    expect(importBackup(m, JSON.stringify({ lineup: 'backup', data: {} }))).toBeNull();
    expect(
      importBackup(m, JSON.stringify({ lineup: 'backup', data: { 'other.key': 'x' } })),
    ).toBeNull();
    expect(m.getItem('lineup.settings.v1')).toBe('mine');
  });

  it('refuses anything that is not a backup, and keys outside the app', () => {
    const m = new Mem();
    m.setItem('lineup.settings.v1', 'mine');
    for (const bad of ['', 'nope', '[]', '{"lineup":"progress"}', '{"lineup":"backup"}'])
      expect(importBackup(m, bad), bad).toBeNull();
    expect(m.getItem('lineup.settings.v1')).toBe('mine');
    const sneaky = JSON.stringify({
      lineup: 'backup',
      data: { 'evil.key': 'x', 'lineup.a': 'y', 'lineup.b': 5 },
    });
    expect(importBackup(m, sneaky)).toBe(1);
    expect(m.getItem('evil.key')).toBeNull();
  });
});
