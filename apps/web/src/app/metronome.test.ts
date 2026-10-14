import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  MetronomeScheduler,
  MetronomeStore,
  TapTempo,
  clampBpm,
  nextLevel,
  parseConfig,
  resizePattern,
  tempoName,
  type Click,
  type MetronomeConfig,
} from './metronome';

class Mem {
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

const run = (
  config: MetronomeConfig,
  seconds: number,
  onTick?: (s: MetronomeScheduler) => void,
) => {
  const clicks: Click[] = [];
  const m = new MetronomeScheduler(
    () => config,
    (c) => clicks.push(c),
  );
  m.start(0);
  for (let t = 0; t <= seconds; t += 0.025) {
    m.advance(t);
    onTick?.(m);
  }
  return { clicks, m };
};

describe('tempo helpers', () => {
  it('keeps a tempo in range', () => {
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(999)).toBe(300);
    expect(clampBpm(100.4)).toBe(100);
    expect(clampBpm(NaN)).toBe(100);
  });
  it('names tempos', () => {
    expect(tempoName(50)).toBe('Largo');
    expect(tempoName(72)).toBe('Adagio');
    expect(tempoName(120)).toBe('Allegro');
    expect(tempoName(250)).toBe('Prestissimo');
  });
  it('resizes the bar and keeps the beats it had', () => {
    expect(resizePattern(['accent', 'soft', 'mute'], 5)).toEqual([
      'accent',
      'soft',
      'mute',
      'normal',
      'normal',
    ]);
    expect(resizePattern(['accent', 'soft', 'mute'], 2)).toEqual(['accent', 'soft']);
    expect(resizePattern([], 3)).toEqual(['accent', 'normal', 'normal']);
    expect(resizePattern(['accent'], 99)).toHaveLength(12);
    expect(resizePattern(['accent'], 0)).toHaveLength(1);
  });
  it('cycles a beat through its levels', () => {
    expect(nextLevel('accent')).toBe('normal');
    expect(nextLevel('mute')).toBe('accent');
  });
});

describe('TapTempo', () => {
  it('needs two taps, then averages the gap', () => {
    const t = new TapTempo();
    expect(t.tap(0)).toBeNull();
    expect(t.tap(0.5)).toBe(120);
    expect(t.tap(1.0)).toBe(120);
    expect(t.tap(1.52)).toBe(118);
  });
  it('starts over after a pause', () => {
    const t = new TapTempo();
    t.tap(0);
    t.tap(0.5);
    expect(t.tap(10)).toBeNull();
    expect(t.tap(11)).toBe(60);
  });
  it('averages over the last few taps only', () => {
    const t = new TapTempo(3);
    [0, 1, 2, 2.5].forEach((x) => t.tap(x));
    // the last three taps: 2, 2.5, 3 → 1.0 s for two gaps
    expect(t.tap(3)).toBe(clampBpm((60 * 2) / 1.0));
  });
});

describe('MetronomeScheduler', () => {
  const cfg = (over: Partial<MetronomeConfig> = {}): MetronomeConfig => ({
    ...DEFAULT_CONFIG,
    bpm: 120,
    ...over,
  });

  it('clicks on every beat at the tempo, accenting the first', () => {
    const { clicks } = run(cfg(), 4.0);
    expect(clicks.slice(0, 5).map((c) => c.time)).toEqual([0, 0.5, 1, 1.5, 2]);
    expect(clicks.slice(0, 5).map((c) => c.accent)).toEqual([true, false, false, false, true]);
    expect(clicks.slice(0, 5).map((c) => c.beat)).toEqual([0, 1, 2, 3, 0]);
    expect(clicks[4]!.bar).toBe(1);
    expect(clicks[0]!.gain).toBeGreaterThan(clicks[1]!.gain);
  });

  it('subdivides the beat', () => {
    const eighths = run(cfg({ subdivision: 'eighths' }), 1).clicks;
    expect(eighths.slice(0, 4).map((c) => c.time)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(eighths[1]!.sub).toBe(1);
    expect(eighths[1]!.gain).toBeLessThan(eighths[0]!.gain);
    const triplets = run(cfg({ subdivision: 'triplets' }), 1).clicks;
    expect(triplets[1]!.time).toBeCloseTo(1 / 6);
    const swing = run(cfg({ subdivision: 'swing' }), 1).clicks;
    expect(swing.slice(0, 3).map((c) => +c.time.toFixed(4))).toEqual([0, 0.3333, 0.5]);
    const sixteenths = run(cfg({ subdivision: 'sixteenths' }), 1).clicks;
    expect(sixteenths[1]!.time).toBeCloseTo(0.125);
  });

  it('skips muted beats but keeps time', () => {
    const { clicks } = run(cfg({ pattern: ['accent', 'mute', 'normal', 'mute'] }), 2);
    expect(clicks.slice(0, 3).map((c) => c.time)).toEqual([0, 1, 2]);
  });

  it('follows the beats of the bar, including a bar of three', () => {
    const { clicks } = run(cfg({ pattern: ['accent', 'normal', 'normal'] }), 3);
    expect(clicks.slice(0, 4).map((c) => c.beat)).toEqual([0, 1, 2, 0]);
    expect(clicks[3]!.time).toBe(1.5);
  });

  it('applies a tempo change at the next click, without a gap or a double', () => {
    const config = cfg();
    const clicks: Click[] = [];
    const m = new MetronomeScheduler(
      () => config,
      (c) => clicks.push(c),
    );
    m.start(0);
    for (let t = 0; t <= 2; t += 0.025) m.advance(t);
    config.bpm = 60;
    m.retune();
    for (let t = 2; t <= 6; t += 0.025) m.advance(t);
    const gaps = clicks.slice(1).map((c, i) => +(c.time - clicks[i]!.time).toFixed(3));
    expect(gaps.every((g) => g === 0.5 || g === 1)).toBe(true);
    expect(gaps.at(-1)).toBe(1);
  });

  it('skips clicks that are already late instead of playing them in a burst', () => {
    const clicks: Click[] = [];
    const m = new MetronomeScheduler(
      () => cfg(),
      (c) => clicks.push(c),
    );
    m.start(0);
    m.advance(5); // a timer that did not run for five seconds
    expect(clicks.every((c) => c.time >= 5 - 0.02)).toBe(true);
    // and the beat grid is kept: the next click is on the 0.5 s grid
    expect(clicks[0]!.time % 0.5).toBeCloseTo(0, 6);
  });

  it('stops', () => {
    const clicks: Click[] = [];
    const m = new MetronomeScheduler(
      () => cfg(),
      (c) => clicks.push(c),
    );
    m.start(0);
    m.advance(0.01);
    m.stop();
    m.advance(10);
    expect(clicks).toHaveLength(1);
    expect(m.isRunning).toBe(false);
  });

  it('only schedules ahead by the lookahead', () => {
    const clicks: Click[] = [];
    const m = new MetronomeScheduler(
      () => cfg(),
      (c) => clicks.push(c),
    );
    m.start(1);
    m.advance(0.5, 0.12);
    expect(clicks).toHaveLength(0);
    m.advance(0.9, 0.12);
    expect(clicks).toHaveLength(1);
  });

  it('the speed trainer raises the tempo every few bars up to the target', () => {
    const config = cfg({
      bpm: 100,
      pattern: ['accent', 'normal'],
      trainer: { on: true, step: 10, bars: 2, target: 120 },
    });
    const { clicks, m } = run(config, 20);
    const bpms = new Set<number>();
    let prev = clicks[0]!.time;
    for (const c of clicks.slice(1)) {
      bpms.add(Math.round(60 / (c.time - prev)));
      prev = c.time;
    }
    expect([...bpms].sort((a, b) => a - b)).toEqual([100, 110, 120]);
    expect(m.currentBpm).toBe(120);
  });

  it('the speed trainer can slow down, and never passes the target', () => {
    const config = cfg({
      bpm: 100,
      pattern: ['accent'],
      trainer: { on: true, step: -30, bars: 1, target: 85 },
    });
    const { m } = run(config, 10);
    expect(m.currentBpm).toBe(85);
  });
});

describe('storage', () => {
  it('reads defaults from nothing, and repairs bad fields one by one', () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    const c = parseConfig({
      bpm: 9999,
      pattern: ['accent', 'loud'],
      subdivision: 'quarters',
      sound: 'wood',
      volume: 4,
      trainer: { on: true, step: 'x', bars: 500, target: 10 },
    });
    expect(c.bpm).toBe(300);
    expect(c.pattern).toEqual(DEFAULT_CONFIG.pattern); // one bad beat spoils the pattern
    expect(c.subdivision).toBe('none');
    expect(c.sound).toBe('wood');
    expect(c.volume).toBe(1);
    expect(c.trainer).toMatchObject({ on: true, bars: 32, target: 20 });
    expect(c.trainer.step).toBe(5);
  });

  it('round-trips the set-up and presets', () => {
    const store = new MetronomeStore(new Mem());
    const c = { ...DEFAULT_CONFIG, bpm: 72, subdivision: 'triplets' as const };
    store.saveConfig(c);
    expect(store.config()).toEqual(c);
    store.savePreset('Waltz', { ...c, pattern: ['accent', 'normal', 'normal'] });
    store.savePreset('Waltz', { ...c, bpm: 90 });
    store.savePreset('', c);
    expect(store.presets().map((p) => p.name)).toEqual(['Waltz', '72 bpm']);
    expect(store.presets()[0]!.config.bpm).toBe(90);
    expect(store.config()).toEqual(c); // presets leave the set-up alone
    expect(store.deletePreset('Waltz').map((p) => p.name)).toEqual(['72 bpm']);
  });

  it('keeps at most twelve presets, newest last', () => {
    const store = new MetronomeStore(new Mem());
    for (let i = 0; i < 15; i++) store.savePreset(`p${i}`, DEFAULT_CONFIG);
    const names = store.presets().map((p) => p.name);
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('p3');
    expect(names.at(-1)).toBe('p14');
  });

  it('survives corrupt storage and a missing store', () => {
    const mem = new Mem();
    mem.setItem('lineup.metronome.v1', '{not json');
    expect(new MetronomeStore(mem).config()).toEqual(DEFAULT_CONFIG);
    expect(new MetronomeStore(mem).presets()).toEqual([]);
    const none = new MetronomeStore(null);
    none.saveConfig(DEFAULT_CONFIG);
    expect(none.config()).toEqual(DEFAULT_CONFIG);
  });
});
