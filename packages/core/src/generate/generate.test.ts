import { describe, expect, it } from 'vitest';
import { loadChart } from '../chart';
import { rateChart } from '../difficulty';
import { getProfile } from '../profiles';
import { ukuleleHasChord } from '../chords';
import { getSong, songCategory, songsFor } from '../songs';
import {
  EXERCISE_KINDS,
  EXERCISE_TONICS,
  SCALES,
  SCALE_IDS,
  chance,
  chordChangeDrills,
  createRng,
  degreeToMidi,
  exerciseCharts,
  generateChordSong,
  hashSeed,
  majorPitchClasses,
  pick,
  pickWeighted,
  scalePitchClasses,
  seedForDifficulty,
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
  /** The profiles whose exercises are sounded notes (the ukulele's are plucked: tested below). */
  const profiles = ['voice', 'wind'];

  it('are built for voice, wind and ukulele only', () => {
    expect(Object.keys(EXERCISE_TONICS).sort()).toEqual(['ukulele-strum', 'voice', 'wind']);
    expect(exerciseCharts('nope')).toEqual({});
  });

  it.each(profiles)('%s: lists its exercises with tidy ids and titles', (profileId) => {
    const charts = exerciseCharts(profileId);
    expect(Object.keys(charts).length).toBeGreaterThanOrEqual(13);
    for (const [id, chart] of Object.entries(charts)) {
      expect(id).toMatch(new RegExp(`^ex-${profileId}-[a-z-]+$`));
      expect(chart.meta.instruments).toEqual([profileId]);
      expect(chart.meta.title).toMatch(/^[A-Z][^:]+: .+/);
      expect(chart.meta.tonic).toBe(EXERCISE_TONICS[profileId]);
    }
    expect(new Set(Object.values(charts).map((c) => c.meta.title)).size).toBe(
      Object.keys(charts).length,
    );
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
      if (id.includes('chromatic') || id.includes('range')) continue; // not in one key, by design
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
      expect(list.slice(0, firstExercise).every((s) => s.category !== 'exercise')).toBe(true);
    }
  });
});

describe('ukulele exercises', () => {
  const OPEN = [67, 60, 64, 69]; // G C E A
  const charts = exerciseCharts('ukulele-strum');
  /** The pitch a plucked note sounds, from the string and fret it names. */
  const pitchOf = (frets: readonly (number | null)[]): number => {
    const strings = frets.flatMap((f, i) => (f === null ? [] : [OPEN[i]! + f]));
    expect(strings).toHaveLength(1); // one string at a time
    return strings[0]!;
  };

  it('are the scales that stay on the first frets, plucked on single strings', () => {
    expect(Object.keys(charts).sort()).toEqual([
      'ex-ukulele-strum-chromatic-up-down',
      'ex-ukulele-strum-dorian-thirds',
      'ex-ukulele-strum-dorian-up-down',
      'ex-ukulele-strum-major-arpeggios',
      'ex-ukulele-strum-major-fifths',
      'ex-ukulele-strum-major-fourths',
      'ex-ukulele-strum-major-ladder',
      'ex-ukulele-strum-major-long-tones',
      'ex-ukulele-strum-major-octaves',
      'ex-ukulele-strum-major-patterns',
      'ex-ukulele-strum-major-pentatonic-up-down',
      'ex-ukulele-strum-major-thirds',
      'ex-ukulele-strum-major-up-down',
    ]);
    for (const [id, chart] of Object.entries(charts)) {
      expect(chart.meta.instruments, id).toEqual(['ukulele-strum']);
      expect(chart.meta.tonic, id).toBe(60);
      for (const n of chart.notes) {
        expect(n.pitch, id).toBeUndefined();
        expect(n.expected?.chord, id).toBeUndefined();
      }
    }
  });

  it('start and end on the root and stay in the scale', () => {
    const major = charts['ex-ukulele-strum-major-up-down']!;
    const pitches = major.notes.map((n) => pitchOf(n.expected!.frets!));
    expect(pitches[0]).toBe(60);
    expect(pitches.at(-1)).toBe(60);
    expect(Math.max(...pitches)).toBe(72);
    const parent = majorPitchClasses(60);
    for (const [id, chart] of Object.entries(charts)) {
      if (id.includes('chromatic')) continue;
      for (const n of chart.notes) expect(parent, id).toContain(pitchOf(n.expected!.frets!) % 12);
    }
  });

  it('appear in the ukulele menu as exercises, after the songs', () => {
    const list = songsFor('ukulele-strum');
    const first = list.findIndex((s) => s.category === 'exercise');
    expect(first).toBeGreaterThan(0);
    expect(list.slice(first).every((s) => s.category === 'exercise')).toBe(true);
  });
});

describe('seedForDifficulty', () => {
  const sequence = (start: number) => {
    let s = start;
    return () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  };

  it('finds a random song at (or next to) the difficulty asked for, repeatably', () => {
    const build = (seed: number) => generateChordSong({ seed, level: 'hard' });
    // targets that some seed is known to reach
    for (const known of [5, 6, 7]) {
      const target = rateChart(build(known)).score;
      const seed = seedForDifficulty(build, target, sequence(target), 400);
      expect(seedForDifficulty(build, target, sequence(target), 400)).toBe(seed);
      expect(rateChart(build(seed)).score).toBe(target);
    }
  });

  it('gives the nearest song when the target cannot be reached', () => {
    const build = (seed: number) => generateChordSong({ seed, level: 'easy' });
    const seed = seedForDifficulty(build, 10, sequence(1), 20);
    expect(rateChart(build(seed)).score).toBeLessThan(10);
  });
});

describe('chord change drills', () => {
  const drills = chordChangeDrills();

  it('are valid ukulele exercises with tidy ids, and speed up the changes', () => {
    expect(Object.keys(drills)).toHaveLength(16);
    for (const [id, chart] of Object.entries(drills)) {
      expect(id).toMatch(/^ex-ukulele-strum-changes-[a-z0-9]+-[a-z0-9]+$/);
      expect(loadChart(chart).ok, id).toBe(true);
      expect(chart.meta.instruments).toEqual(['ukulele-strum']);
      expect(getSong(id)).toEqual(chart);
      expect(songCategory(id)).toBe('exercise');
      // a stroke on every one of 40 beats, only two chords
      expect(chart.notes).toHaveLength(40);
      const chords = chart.notes.map((n) => n.expected!.chord!);
      expect(new Set(chords).size).toBe(2);
      let changes = 0;
      chords.forEach((c, i) => {
        if (i > 0 && c !== chords[i - 1]) changes++;
      });
      expect(changes).toBe(19);
    }
  });

  it('only use chords that have a fingering', () => {
    for (const chart of Object.values(drills))
      for (const n of chart.notes) expect(ukuleleHasChord(n.expected!.chord!)).toBe(true);
  });
});
