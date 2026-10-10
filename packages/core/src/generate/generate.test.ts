import { describe, expect, it } from 'vitest';
import { loadChart } from '../chart';
import { getProfile } from '../profiles';
import { songsFor } from '../songs';
import {
  EXERCISE_KINDS,
  EXERCISE_TONICS,
  SCALES,
  SCALE_IDS,
  chance,
  createRng,
  degreeToMidi,
  exerciseCharts,
  hashSeed,
  majorPitchClasses,
  pick,
  pickWeighted,
  scalePitchClasses,
} from '.';

describe('createRng', () => {
  it('gives the same sequence for the same seed and different ones for different seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const seqA = Array.from({ length: 20 }, a);
    expect(Array.from({ length: 20 }, b)).toEqual(seqA);
    expect(Array.from({ length: 20 }, c)).not.toEqual(seqA);
  });

  it('stays inside [0, 1) and spreads out', () => {
    const r = createRng(7);
    const xs = Array.from({ length: 5000 }, r);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    for (let decile = 0; decile < 10; decile++) {
      const n = xs.filter((x) => x >= decile / 10 && x < (decile + 1) / 10).length;
      expect(n, `decile ${decile}`).toBeGreaterThan(400);
    }
  });

  it('seed 0 and huge or negative seeds still work', () => {
    for (const seed of [0, 2 ** 32 - 1, 2 ** 40, -5]) {
      const x = createRng(seed)();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('hashSeed', () => {
  it('is stable and tells different words apart', () => {
    expect(hashSeed('lineup')).toBe(hashSeed('lineup'));
    expect(hashSeed('lineup')).not.toBe(hashSeed('Lineup'));
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(Number.isInteger(hashSeed('anything'))).toBe(true);
  });
});

describe('pick, pickWeighted and chance', () => {
  it('pick chooses every item eventually and refuses an empty list', () => {
    const r = createRng(1);
    const seen = new Set(Array.from({ length: 200 }, () => pick(r, ['a', 'b', 'c'])));
    expect(seen).toEqual(new Set(['a', 'b', 'c']));
    expect(() => pick(r, [])).toThrow(/nothing to choose/);
  });

  it('pickWeighted follows the weights and never chooses a weight of zero', () => {
    const r = createRng(2);
    const items = [
      { item: 'often', weight: 9 },
      { item: 'rarely', weight: 1 },
      { item: 'never', weight: 0 },
    ];
    const counts = { often: 0, rarely: 0, never: 0 };
    for (let i = 0; i < 5000; i++) counts[pickWeighted(r, items) as keyof typeof counts]++;
    expect(counts.never).toBe(0);
    expect(counts.often / 5000).toBeGreaterThan(0.86);
    expect(counts.often / 5000).toBeLessThan(0.94);
    expect(() => pickWeighted(r, [{ item: 'x', weight: 0 }])).toThrow(/positive weight/);
  });

  it('chance is true about as often as asked', () => {
    const r = createRng(3);
    const hits = Array.from({ length: 4000 }, () => chance(r, 0.25)).filter(Boolean).length;
    expect(hits / 4000).toBeGreaterThan(0.22);
    expect(hits / 4000).toBeLessThan(0.28);
    expect(chance(r, 0)).toBe(false);
    expect(chance(r, 1)).toBe(true);
  });
});

describe('scales', () => {
  it('every scale ascends from 0 and stays inside one octave', () => {
    for (const id of SCALE_IDS) {
      const { steps } = SCALES[id];
      expect(steps[0], id).toBe(0);
      for (let i = 1; i < steps.length; i++) expect(steps[i]!, id).toBeGreaterThan(steps[i - 1]!);
      expect(steps.at(-1)!, id).toBeLessThan(12);
    }
  });

  it('every scale lies inside the major scale it says it belongs to', () => {
    const parent = majorPitchClasses(0);
    for (const id of SCALE_IDS) {
      const scale = SCALES[id];
      const root = scale.rootFromParent; // a parent tonic of C (0)
      for (const pc of scalePitchClasses(scale, root)) expect(parent, `${id} ${pc}`).toContain(pc);
    }
  });

  it('the modes use exactly the notes of their parent major scale', () => {
    for (const id of ['major', 'minor', 'dorian', 'mixolydian'] as const) {
      const pcs = scalePitchClasses(SCALES[id], SCALES[id].rootFromParent);
      expect(
        [...pcs].sort((a, b) => a - b),
        id,
      ).toEqual(majorPitchClasses(0));
    }
  });

  it('degreeToMidi wraps by octaves, in both directions', () => {
    const major = SCALES.major;
    expect(degreeToMidi(major, 60, 0)).toBe(60);
    expect(degreeToMidi(major, 60, 2)).toBe(64);
    expect(degreeToMidi(major, 60, 7)).toBe(72);
    expect(degreeToMidi(major, 60, 8)).toBe(74);
    expect(degreeToMidi(major, 60, -1)).toBe(59);
    expect(degreeToMidi(major, 60, -7)).toBe(48);
    expect(degreeToMidi(SCALES['major-pentatonic'], 60, 5)).toBe(72);
    expect(degreeToMidi(SCALES['major-pentatonic'], 60, 7)).toBe(76);
  });
});

describe('exercises', () => {
  const profiles = Object.keys(EXERCISE_TONICS);

  it('are built for voice and wind only', () => {
    expect(profiles.sort()).toEqual(['voice', 'wind']);
    expect(exerciseCharts('ukulele-strum')).toEqual({});
    expect(exerciseCharts('nope')).toEqual({});
  });

  it.each(profiles)('%s: lists twelve exercises with tidy ids and titles', (profileId) => {
    const charts = exerciseCharts(profileId);
    expect(Object.keys(charts)).toHaveLength(12);
    for (const [id, chart] of Object.entries(charts)) {
      expect(id).toMatch(new RegExp(`^ex-${profileId}-[a-z-]+$`));
      expect(chart.meta.instruments).toEqual([profileId]);
      expect(chart.meta.title).toMatch(/^[A-Z][^:]+: .+/);
      expect(chart.meta.tonic).toBe(EXERCISE_TONICS[profileId]);
    }
    expect(new Set(Object.values(charts).map((c) => c.meta.title)).size).toBe(12);
  });

  it.each(profiles)('%s: every exercise is a valid chart that is easy to play', (profileId) => {
    const profile = getProfile(profileId);
    for (const [id, chart] of Object.entries(exerciseCharts(profileId))) {
      expect(loadChart(chart).ok, id).toBe(true);
      expect(chart.notes[0]!.t, id).toBe(0);
      // notes in order, each with a gap after it so repeated notes are separate
      for (let i = 1; i < chart.notes.length; i++) {
        const prev = chart.notes[i - 1]!;
        expect(chart.notes[i]!.t, `${id} #${i}`).toBeGreaterThan(prev.t + prev.duration);
        expect(prev.duration, `${id} #${i - 1}`).toBeGreaterThan(0.4);
      }
      const last = chart.notes.at(-1)!;
      expect(last.t + last.duration, id).toBeLessThan(60); // under a minute
      expect(chart.notes.length, id).toBeGreaterThanOrEqual(7);
      // inside the instrument's range
      const pitches = chart.notes.map((n) => n.pitch!);
      expect(Math.min(...pitches), id).toBeGreaterThanOrEqual(profile.range!.lowMidi);
      expect(Math.max(...pitches), id).toBeLessThanOrEqual(profile.range!.highMidi);
    }
  });

  it.each(profiles)('%s: every note belongs to the key the exercise says it is in', (profileId) => {
    for (const [id, chart] of Object.entries(exerciseCharts(profileId))) {
      const parent = majorPitchClasses(chart.meta.tonic!);
      for (const n of chart.notes) expect(parent, `${id} ${n.pitch}`).toContain(n.pitch! % 12);
    }
  });

  it('a run starts and ends on the root of its scale', () => {
    const charts = exerciseCharts('voice');
    const major = charts['ex-voice-major-up-down']!;
    expect(major.notes[0]!.pitch).toBe(60);
    expect(major.notes.at(-1)!.pitch).toBe(60);
    expect(Math.max(...major.notes.map((n) => n.pitch!))).toBe(72);
    expect(major.notes).toHaveLength(15);
    const minor = charts['ex-voice-minor-up-down']!;
    expect(minor.notes[0]!.pitch).toBe(57); // A3, under a voice's C4
    expect(minor.notes.at(-1)!.pitch).toBe(57);
  });

  it('a whistle or recorder never has to play below its tonic: wind modes start at or above it', () => {
    const tonic = EXERCISE_TONICS['wind']!;
    for (const [id, chart] of Object.entries(exerciseCharts('wind'))) {
      expect(Math.min(...chart.notes.map((n) => n.pitch!)), id).toBeGreaterThanOrEqual(tonic);
    }
  });

  it('the patterns have the shapes they say', () => {
    const n = 7;
    const degrees = (kind: keyof typeof EXERCISE_KINDS) =>
      EXERCISE_KINDS[kind].steps(n).map((s) => s.degree);
    expect(degrees('up-down')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(degrees('thirds').slice(0, 6)).toEqual([0, 2, 1, 3, 2, 4]);
    expect(degrees('thirds').at(-1)).toBe(7);
    expect(degrees('patterns').slice(0, 8)).toEqual([0, 1, 2, 0, 1, 2, 3, 1]);
    expect(degrees('ladder').slice(0, 6)).toEqual([0, 1, 0, 2, 0, 3]);
    expect(degrees('ladder').at(-1)).toBe(7);
    const long = EXERCISE_KINDS['long-tones'].steps(n);
    expect(long.every((s) => s.beats === 4)).toBe(true);
    // the last note of a run is held
    expect(EXERCISE_KINDS['up-down'].steps(n).at(-1)!.beats).toBe(2);
  });

  it('appear in the song menus as exercises, after the songs', () => {
    for (const profileId of ['voice', 'wind']) {
      const list = songsFor(profileId);
      const firstExercise = list.findIndex((s) => s.category === 'exercise');
      expect(firstExercise, profileId).toBeGreaterThan(0);
      expect(list.slice(firstExercise).every((s) => s.category === 'exercise')).toBe(true);
      expect(list.slice(0, firstExercise).every((s) => s.category === 'song')).toBe(true);
    }
    expect(songsFor('ukulele-strum').every((s) => s.category === 'song')).toBe(true);
  });
});
