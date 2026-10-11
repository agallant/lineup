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
