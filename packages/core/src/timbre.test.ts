import { describe, expect, it } from 'vitest';
import { EnrollmentSession } from './enrollment';
import {
  TIMBRE_FEATURES,
  TimbreModelStore,
  classSeparation,
  classify,
  featureVector,
  parseTimbreModel,
  trainTimbreModel,
  type KeyValueStorage,
  type TrainingSample,
} from './timbre';

/** Feature records around a typical sound, with a deterministic wobble. */
function hit(
  base: {
    centroid: number;
    low: number;
    mid: number;
    high: number;
    decayMs: number;
    zcr: number;
    flatness: number;
  },
  i: number,
  peakDb = -12,
): Record<string, number> {
  const w = Math.sin(i * 12.9898) * 0.5; // -0.5..0.5, repeatable
  return {
    centroid: base.centroid * (1 + 0.12 * w),
    low: Math.max(0, base.low + 0.03 * w),
    mid: Math.max(0, base.mid + 0.03 * w),
    high: Math.max(0, base.high - 0.03 * w),
    decayMs: base.decayMs * (1 + 0.2 * w),
    zcr: base.zcr * (1 + 0.1 * w),
    flatness: base.flatness + 0.03 * w,
    peakDb,
    rmsDb: peakDb - 8,
  };
}
const CLAP = {
  centroid: 2400,
  low: 0.05,
  mid: 0.5,
  high: 0.45,
  decayMs: 25,
  zcr: 0.25,
  flatness: 0.35,
};
const TAP = {
  centroid: 350,
  low: 0.55,
  mid: 0.4,
  high: 0.05,
  decayMs: 12,
  zcr: 0.06,
  flatness: 0.02,
};
const BOOM = {
  centroid: 90,
  low: 0.97,
  mid: 0.025,
  high: 0.005,
  decayMs: 160,
  zcr: 0.01,
  flatness: 0.01,
};

const train = (n = 6): TrainingSample[] => [
  ...Array.from({ length: n }, (_, i) => ({ classId: 'clap', features: hit(CLAP, i) })),
  ...Array.from({ length: n }, (_, i) => ({ classId: 'tap', features: hit(TAP, i + 50) })),
];

describe('featureVector', () => {
  it('needs every feature to be a finite number', () => {
    expect(featureVector(undefined)).toBeNull();
    expect(featureVector({ centroid: 1000 })).toBeNull();
    expect(featureVector({ ...hit(CLAP, 0), zcr: NaN })).toBeNull();
    expect(featureVector(hit(CLAP, 0))).toHaveLength(TIMBRE_FEATURES.length);
  });

  it('ignores level: the same sound at another volume has the same vector', () => {
    expect(featureVector(hit(CLAP, 3, -30))).toEqual(featureVector(hit(CLAP, 3, -6)));
  });
});

describe('classification', () => {
  const model = trainTimbreModel(train());

  it('puts new hits of each enrolled sound in the right class', () => {
    for (let i = 100; i < 140; i++) {
      expect(classify(model, hit(CLAP, i))!.id).toBe('clap');
      expect(classify(model, hit(TAP, i))!.id).toBe('tap');
    }
  });

  it('rejects a sound that is neither as "unknown" but still reports the nearest class', () => {
    const c = classify(model, hit(BOOM, 1))!;
    expect(c.id).toBeNull();
    expect(['clap', 'tap']).toContain(c.nearest);
  });

  it('a single class never rejects on timbre (any-hit)', () => {
    const one = trainTimbreModel(train().filter((s) => s.classId === 'clap'));
    expect(classify(one, hit(TAP, 1))!.id).toBe('clap');
    expect(classify(one, hit(TAP, 1))!.margin).toBe(0);
  });

  it('reports a bigger margin for clear hits than for hits between the classes', () => {
    const clear = classify(model, hit(CLAP, 7))!;
    const between = classify(model, {
      ...hit(CLAP, 7),
      centroid: 1000,
      low: 0.3,
      mid: 0.45,
      high: 0.25,
      decayMs: 18,
      zcr: 0.15,
      flatness: 0.18,
    })!;
    expect(clear.margin).toBeGreaterThan(between.margin);
  });

  it('measures how far apart classes are, and flags near-identical ones', () => {
    expect(classSeparation(model, 'clap', 'tap')).toBeGreaterThan(5);
    const alike = trainTimbreModel([
      ...Array.from({ length: 6 }, (_, i) => ({ classId: 'a', features: hit(CLAP, i) })),
      ...Array.from({ length: 6 }, (_, i) => ({
        classId: 'b',
        features: hit({ ...CLAP, centroid: 2500 }, i + 9),
      })),
    ]);
    expect(classSeparation(alike, 'a', 'b')).toBeLessThan(2.5);
  });

  it('separation shrinks smoothly as two sounds get closer', () => {
    const pair = (centroid: number) =>
      trainTimbreModel([
        ...Array.from({ length: 6 }, (_, i) => ({ classId: 'a', features: hit(CLAP, i) })),
        ...Array.from({ length: 6 }, (_, i) => ({
          classId: 'b',
          features: hit({ ...CLAP, centroid }, i + 9),
        })),
      ]);
    const far = classSeparation(pair(1800), 'a', 'b');
    const near = classSeparation(pair(2100), 'a', 'b');
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0.5);
  });

  it('returns null for events without features and throws when there is nothing to learn from', () => {
    expect(classify(model, undefined)).toBeNull();
    expect(() => trainTimbreModel([])).toThrow(/no usable/);
    expect(() => trainTimbreModel([{ classId: 'x', features: {} }])).toThrow(/no usable/);
  });

  it('identical enrollments do not make the model brittle (spread is floored)', () => {
    const same = trainTimbreModel(
      Array.from({ length: 6 }, () => ({ classId: 'clap', features: hit(CLAP, 0) })),
    );
    expect(same.scale.every((s) => s > 0.01)).toBe(true);
    expect(classify(same, hit(CLAP, 9))!.id).toBe('clap');
  });
});

class FakeStorage implements KeyValueStorage {
  data = new Map<string, string>();
  getItem = (k: string) => this.data.get(k) ?? null;
  setItem = (k: string, v: string) => void this.data.set(k, v);
  removeItem = (k: string) => void this.data.delete(k);
}

describe('TimbreModelStore', () => {
  const model = trainTimbreModel(train());

  it('round-trips a model through JSON', () => {
    const fake = new FakeStorage();
    const store = new TimbreModelStore(() => fake);
    expect(store.save('hand-percussion', model)).toBe(true);
    expect(store.load('hand-percussion')).toEqual(model);
    expect(store.load('drum-kit')).toBeNull();
  });

  it('ignores a saved model whose classes no longer match the profile', () => {
    const fake = new FakeStorage();
    const store = new TimbreModelStore(() => fake);
    store.save('p', model);
    expect(store.load('p', ['clap', 'tap'])).toEqual(model);
    expect(store.load('p', ['clap', 'tap', 'snare'])).toBeNull();
  });

  it('survives corrupt data, blocked storage and a full disk', () => {
    const fake = new FakeStorage();
    fake.setItem('lineup.timbre.p', '{not json');
    expect(new TimbreModelStore(() => fake).load('p')).toBeNull();
    fake.setItem('lineup.timbre.p', JSON.stringify({ version: 1, classes: [], scale: [] }));
    expect(new TimbreModelStore(() => fake).load('p')).toBeNull();

    const throwing: KeyValueStorage = {
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
    const store = new TimbreModelStore(() => throwing);
    expect(store.load('p')).toBeNull();
    expect(store.save('p', model)).toBe(false);
    expect(() => store.clear('p')).not.toThrow();
    expect(new TimbreModelStore(() => undefined).save('p', model)).toBe(false);
  });

  it('clear removes the saved model', () => {
    const fake = new FakeStorage();
    const store = new TimbreModelStore(() => fake);
    store.save('p', model);
    store.clear('p');
    expect(store.load('p')).toBeNull();
  });
});

describe('parseTimbreModel', () => {
  const good = trainTimbreModel(train());
  it.each([
    ['null', null],
    ['wrong version', { ...good, version: 2 }],
    ['short scale', { ...good, scale: [1] }],
    ['zero scale', { ...good, scale: good.scale.map(() => 0) }],
    ['short mean', { ...good, classes: [{ ...good.classes[0], mean: [1] }] }],
    ['no classes', { ...good, classes: [] }],
    ['NaN radius', { ...good, classes: [{ ...good.classes[0], radius: NaN }] }],
  ])('rejects %s', (_n, raw) => expect(parseTimbreModel(raw)).toBeNull());
  it('accepts a good one', () =>
    expect(parseTimbreModel(JSON.parse(JSON.stringify(good)))).toEqual(good));
});

describe('EnrollmentSession', () => {
  const classes = [
    { id: 'clap', label: 'Clap', prompt: 'Clap' },
    { id: 'tap', label: 'Tap', prompt: 'Tap' },
  ];
  const ev = (time: number, features: Record<string, number> | undefined) => ({
    time,
    kind: 'onset' as const,
    ...(features ? { features } : {}),
  });

  it('collects class by class and builds a model that tells them apart', () => {
    const s = new EnrollmentSession(classes, { perClass: 4 });
    let t = 1;
    for (let i = 0; i < 4; i++) expect(s.add(ev((t += 0.5), hit(CLAP, i)))).toBe('accepted');
    expect(s.current!.id).toBe('tap');
    for (let i = 0; i < 4; i++) expect(s.add(ev((t += 0.5), hit(TAP, i)))).toBe('accepted');
    expect(s.done).toBe(true);
    expect(s.add(ev(t + 0.5, hit(TAP, 9)))).toBe('done');
    const { model, warnings } = s.build();
    expect(warnings).toEqual([]);
    expect(classify(model, hit(TAP, 77))!.id).toBe('tap');
  });

  it('counts a double trigger once', () => {
    const s = new EnrollmentSession(classes, { perClass: 4 });
    expect(s.add(ev(1, hit(CLAP, 0)))).toBe('accepted');
    expect(s.add(ev(1.08, hit(CLAP, 1)))).toBe('double');
    expect(s.countFor('clap')).toBe(1);
    expect(s.add(ev(1.2, hit(CLAP, 2)))).toBe('accepted');
  });

  it('ignores a hit at the very edge of the double window consistently', () => {
    const s = new EnrollmentSession(classes, { perClass: 4, doubleWindow: 0.15 });
    s.add(ev(1, hit(CLAP, 0)));
    expect(s.add(ev(1.149, hit(CLAP, 1)))).toBe('double');
    expect(s.add(ev(1.16, hit(CLAP, 1)))).toBe('accepted');
  });

  it('rejects quiet hits near the noise floor, and hits far quieter than the rest', () => {
    const s = new EnrollmentSession(classes, { perClass: 6 });
    expect(s.add(ev(1, hit(CLAP, 0, -55)))).toBe('too-quiet');
    s.add(ev(2, hit(CLAP, 1, -10)));
    s.add(ev(3, hit(CLAP, 2, -12)));
    expect(s.add(ev(4, hit(CLAP, 3, -40)))).toBe('too-quiet');
    expect(s.add(ev(5, hit(CLAP, 4, -20)))).toBe('accepted'); // quieter but within range
  });

  it('rejects a hit that sounds nothing like the others in the class', () => {
    const s = new EnrollmentSession(classes, { perClass: 6 });
    for (let i = 0; i < 3; i++) s.add(ev(1 + i, hit(CLAP, i)));
    expect(s.add(ev(5, hit(TAP, 1)))).toBe('outlier');
    expect(s.countFor('clap')).toBe(3);
  });

  it('refuses hits without features and building before all classes have hits', () => {
    const s = new EnrollmentSession(classes, { perClass: 3 });
    expect(s.add(ev(1, undefined))).toBe('no-features');
    for (let i = 0; i < 3; i++) s.add(ev(2 + i, hit(CLAP, i)));
    expect(() => s.build()).toThrow(/Tap/);
  });

  it('warns for classes that are close but not identical, not for clearly separate ones', () => {
    const run = (centroid: number, shape = {}) => {
      const s = new EnrollmentSession(classes, { perClass: 4 });
      for (let i = 0; i < 4; i++) s.add(ev(1 + i, hit(CLAP, i)));
      for (let i = 0; i < 4; i++) s.add(ev(10 + i, hit({ ...CLAP, centroid, ...shape }, i + 20)));
      return s.build().warnings.length;
    };
    expect(run(2100)).toBe(1);
    expect(run(TAP.centroid, TAP)).toBe(0);
  });

  it('warns when two classes sound alike', () => {
    const s = new EnrollmentSession(classes, { perClass: 4 });
    for (let i = 0; i < 4; i++) s.add(ev(1 + i, hit(CLAP, i)));
    for (let i = 0; i < 4; i++) s.add(ev(10 + i, hit({ ...CLAP, centroid: 2450 }, i + 20)));
    expect(s.build().warnings).toEqual([expect.stringMatching(/"Clap" and "Tap" sound too alike/)]);
  });

  it('restartClass clears the current class so it can be redone', () => {
    const s = new EnrollmentSession(classes, { perClass: 4 });
    s.add(ev(1, hit(CLAP, 0)));
    s.restartClass();
    expect(s.countFor('clap')).toBe(0);
    expect(s.add(ev(1.01, hit(CLAP, 0)))).toBe('accepted');
  });

  it('needs at least one class', () => {
    expect(() => new EnrollmentSession([])).toThrow();
  });
});
