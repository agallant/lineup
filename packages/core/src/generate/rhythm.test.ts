import { describe, expect, it } from 'vitest';
import { UKULELE_CHORD_FRETS } from '../chords';
import { getProfile } from '../profiles';
import { getSong, songsFor } from '../songs';
import {
  GROOVE_PROFILES,
  generateGroove,
  grooveId,
  parseGrooveId,
  type GrooveProfile,
} from './groove';
import { chordSongBars, chordSongId, generateChordSong, parseChordSongId } from './chordsong';
import { MELODY_LEVELS } from './melody';
import { RHYTHM_EXERCISE_PROFILES, rhythmExercises } from './rudiments';

const SEEDS = Array.from({ length: 80 }, (_, i) => i * 1237 + 5);

/** The lane on each eighth-note step of bar `bar` (null where nothing sounds). */
function barSteps(chart: ReturnType<typeof generateGroove>, bar: number): (string | null)[] {
  const bpb = 60 / chart.meta.bpm;
  const steps: (string | null)[] = Array.from({ length: 8 }, () => null);
  for (const n of chart.notes) {
    const beat = n.t / bpb;
    const step = Math.round((beat - bar * 4) * 2);
    if (step >= 0 && step < 8 && Math.abs(beat - (bar * 4 + step / 2)) < 1e-6)
      steps[step] = n.lane!;
  }
  return steps;
}

describe('generateGroove', () => {
  for (const profileId of GROOVE_PROFILES) {
    for (const level of MELODY_LEVELS) {
      it(`${profileId} ${level}: a steady repeating bar, a fill every four bars, an ending`, () => {
        const lanes = getProfile(profileId).lanes!.map((l) => l.id);
        let repeated = 0;
        for (const seed of SEEDS) {
          const chart = generateGroove(profileId, { seed, level });
          const bpb = 60 / chart.meta.bpm;
          expect(chart.meta.instruments).toEqual([profileId]);
          // only the profile's lanes, one sound at a time, never faster than eighth notes
          let prev = -Infinity;
          for (const n of chart.notes) {
            expect(lanes).toContain(n.lane);
            expect(n.t - prev, `seed ${seed}`).toBeGreaterThan(0.49 * bpb);
            prev = n.t;
          }
          // eight bars; the last is a single hit on the one
          const last = chart.notes.at(-1)!;
          expect(last.t / bpb).toBeCloseTo(28, 4);
          expect(chart.notes.filter((n) => n.t / bpb >= 28 - 1e-4)).toHaveLength(1);
          // the main bar comes round again, so it is a groove and not a random run
          const bars = Array.from({ length: 8 }, (_, b) => barSteps(chart, b).join());
          if (bars[0] === bars[1]) repeated++;
          expect(bars[0], `seed ${seed}`).toBe(bars[1]);
          // the fill is a different bar
          expect(bars[3], `seed ${seed}`).not.toBe(bars[0]);
          expect(bars[3]!.split(',').filter((s) => s !== '').length).toBeGreaterThan(2);
          // every bar of the groove has enough in it to follow
          for (let b = 0; b < 7; b++) {
            const hits = barSteps(chart, b).filter((s) => s !== null).length;
            expect(hits, `seed ${seed} bar ${b}`).toBeGreaterThanOrEqual(2);
          }
        }
        expect(repeated).toBe(SEEDS.length);
      });
    }
  }

  it('a kit beat has the kick on the one and a snare somewhere in every bar of the main beat', () => {
    for (const level of MELODY_LEVELS) {
      for (const seed of SEEDS) {
        const chart = generateGroove('drum-kit', { seed, level });
        for (const b of [0, 1, 4, 5]) {
          const steps = barSteps(chart, b);
          expect(steps[0], `${level} ${seed} bar ${b}`).toBe('kick');
          expect(steps, `${level} ${seed} bar ${b}`).toContain('snare');
        }
      }
    }
  });

  it('is the same for the same spec and changes with the seed', () => {
    const a = generateGroove('drum-kit', { seed: 3, level: 'hard' });
    expect(generateGroove('drum-kit', { seed: 3, level: 'hard' })).toEqual(a);
    const patterns = new Set(
      SEEDS.map((seed) =>
        JSON.stringify(generateGroove('drum-kit', { seed, level: 'hard' }).notes),
      ),
    );
    expect(patterns.size).toBeGreaterThan(2);
  });

  it('has ids that round-trip, and getSong builds them', () => {
    const spec = { seed: 99, level: 'medium' as const };
    for (const p of GROOVE_PROFILES) {
      const id = grooveId(p as GrooveProfile, spec);
      expect(parseGrooveId(id)).toEqual({ profile: p, spec });
      expect(getSong(id)).toEqual(generateGroove(p, spec));
    }
    for (const bad of [
      'gen-groove-drum-kit-medium-007',
      'gen-groove-kazoo-easy-1',
      'gen-groove-clap-extreme-1',
      'gen-groove-clap-easy-100000',
    ])
      expect(parseGrooveId(bad)).toBeNull();
  });
});

describe('generateChordSong', () => {
  it('writes sixteen bars of chords with fingerings that finish at home', () => {
    for (const level of MELODY_LEVELS) {
      for (const seed of SEEDS) {
        const spec = { seed, level };
        const { key, bars, progressions, form } = chordSongBars(spec);
        expect(bars).toHaveLength(16);
        for (const chord of bars) expect(UKULELE_CHORD_FRETS[chord], chord).toBeDefined();
        // the song is four phrases of four bars (some of them the same), and ends on the home chord
        expect(form).toHaveLength(4);
        expect(progressions.length).toBeGreaterThanOrEqual(2);
        expect(progressions.length).toBeLessThanOrEqual(4);
        const home = key;
        expect(bars.at(-1), `${level} ${seed}`).toBe(home);
        if (level === 'easy') expect(['C', 'G', 'D']).toContain(key);
        // no chord is held for more than two bars in a row, apart from the closing pair
        for (let i = 2; i < 14; i++)
          expect(
            bars[i] === bars[i - 1] && bars[i] === bars[i - 2],
            `${level} ${seed} bar ${i}`,
          ).toBe(false);
      }
    }
  });

  it('strums a pattern that repeats, only changing chord at the bar line', () => {
    for (const level of MELODY_LEVELS) {
      for (const seed of SEEDS.slice(0, 30)) {
        const chart = generateChordSong({ seed, level });
        const bpb = 60 / chart.meta.bpm;
        const { bars } = chordSongBars({ seed, level });
        let prev = -Infinity;
        for (const n of chart.notes) {
          const beat = n.t / bpb;
          expect(n.expected?.chord, `${level} ${seed} beat ${beat}`).toBe(
            bars[Math.floor(beat / 4 + 1e-4)],
          );
          expect(n.t - prev).toBeGreaterThan(0.49 * bpb);
          prev = n.t;
          expect(n.lane).toBe(n.expected?.direction);
        }
        // bar 0 and bar 1 use the same pattern
        const pattern = (bar: number) =>
          chart.notes
            .filter((n) => Math.floor(n.t / bpb / 4 + 1e-4) === bar)
            .map((n) => Math.round((n.t / bpb - bar * 4) * 2) + n.lane!)
            .filter((s) => !s.startsWith('7')) // the last stroke is left out before a chord change
            .join();
        expect(pattern(0)).toBe(pattern(1));
        // the song ends on one downstroke on the home chord
        const finalBar = chart.notes.filter((n) => n.t / bpb >= 60 - 1e-4);
        expect(finalBar).toHaveLength(1);
        expect(finalBar[0]!.expected?.direction).toBe('down');
      }
    }
  });

  it('is the same for the same spec and varies with the seed', () => {
    const a = generateChordSong({ seed: 4, level: 'medium' });
    expect(generateChordSong({ seed: 4, level: 'medium' })).toEqual(a);
    const sets = new Set(SEEDS.map((seed) => chordSongBars({ seed, level: 'medium' }).bars.join()));
    expect(sets.size).toBeGreaterThan(8);
  });

  it('has ids that round-trip, and getSong builds them', () => {
    const spec = { seed: 1234, level: 'hard' as const };
    expect(chordSongId(spec)).toBe('gen-chords-hard-1234');
    expect(parseChordSongId('gen-chords-hard-1234')).toEqual(spec);
    expect(getSong('gen-chords-hard-1234')).toEqual(generateChordSong(spec));
    for (const bad of ['gen-chords-hard-01', 'gen-chords-bold-1', 'gen-chords-easy-100000'])
      expect(parseChordSongId(bad)).toBeNull();
  });

  it('makes waltzes: three beats to the bar, with ids that round-trip', () => {
    const spec = { seed: 7, level: 'medium' as const, waltz: true };
    expect(chordSongId(spec)).toBe('gen-waltz-medium-7');
    expect(parseChordSongId('gen-waltz-medium-7')).toEqual(spec);
    const chart = getSong('gen-waltz-medium-7');
    expect(chart).toEqual(generateChordSong(spec));
    const spb = 60 / chart.meta.bpm;
    for (const n of chart.notes) expect(Math.round((n.t / spb) * 2) / 2).toBeCloseTo(n.t / spb, 4);
    expect(chart.notes.at(-1)!.t / spb / 3).toBeCloseTo(15, 4); // the last note starts bar 16
    for (const seed of SEEDS) {
      const bars = chordSongBars({ seed, level: 'hard', waltz: true }).bars;
      expect(bars).toHaveLength(16);
    }
  });

  it('uses the new keys and only chords with a fingering', () => {
    const keys = new Set(SEEDS.map((seed) => chordSongBars({ seed, level: 'hard' }).key));
    expect(keys).toContain('F');
    expect(keys).toContain('A');
  });
});

describe('rhythm exercises', () => {
  it.each(RHYTHM_EXERCISE_PROFILES)(
    '%s: valid exercises with only its lanes, none too fast',
    (id) => {
      const lanes = getProfile(id).lanes!.map((l) => l.id);
      const charts = rhythmExercises(id);
      expect(Object.keys(charts).length).toBeGreaterThanOrEqual(4);
      for (const [key, chart] of Object.entries(charts)) {
        expect(key).toMatch(new RegExp(`^ex-${id}-[a-z-]+$`));
        expect(chart.meta.instruments).toEqual([id]);
        expect(chart.notes.length, key).toBeGreaterThanOrEqual(16);
        let prev = -Infinity;
        for (const n of chart.notes) {
          expect(lanes, key).toContain(n.lane);
          expect(n.t - prev, key).toBeGreaterThan(0.3);
          prev = n.t;
        }
        expect(chart.notes.at(-1)!.t, key).toBeLessThan(40);
      }
      expect(new Set(Object.values(charts).map((c) => c.meta.title)).size).toBe(
        Object.keys(charts).length,
      );
    },
  );

  it('the paradiddle is R L R R L R L L and the doubles are RR LL', () => {
    const charts = rhythmExercises('hand-percussion');
    const lanes = (key: string) =>
      charts[key]!.notes.map((n) => (n.lane === 'clap' ? 'R' : 'L')).join('');
    expect(lanes('ex-hand-percussion-paradiddle').slice(0, 8)).toBe('RLRRLRLL');
    expect(lanes('ex-hand-percussion-double-strokes').slice(0, 8)).toBe('RRLLRRLL');
    expect(lanes('ex-hand-percussion-single-strokes').slice(0, 8)).toBe('RLRLRLRL');
  });

  it('appear in the menus as exercises, after the songs', () => {
    for (const id of RHYTHM_EXERCISE_PROFILES) {
      const list = songsFor(id);
      const first = list.findIndex((s) => s.category === 'exercise');
      expect(first, id).toBeGreaterThan(0);
      expect(list.slice(first).every((s) => s.category === 'exercise')).toBe(true);
    }
  });

  it('counts in one bar: three beats for a waltz, four otherwise', () => {
    expect(generateChordSong({ seed: 3, level: 'easy', waltz: true }).meta.countInBeats).toBe(3);
    expect(generateChordSong({ seed: 3, level: 'easy' }).meta.countInBeats).toBe(4);
  });
});

describe('variety of the random songs', () => {
  const MANY = Array.from({ length: 200 }, (_, i) => i * 977 + 3);
  const distinct = (make: (seed: number) => unknown): number =>
    new Set(MANY.map((seed) => JSON.stringify(make(seed)))).size;

  it('chord songs and waltzes are rarely alike, even at the easy level', () => {
    for (const level of MELODY_LEVELS) {
      expect(
        distinct((seed) => generateChordSong({ seed, level }).notes),
        level,
      ).toBeGreaterThan(120);
      expect(
        distinct((seed) => generateChordSong({ seed, level, waltz: true }).notes),
        `waltz ${level}`,
      ).toBeGreaterThan(120);
    }
  });

  it('chord songs are not one loop of four bars: they move through several chords', () => {
    for (const level of MELODY_LEVELS) {
      let distinctChords = 0;
      for (const seed of MANY.slice(0, 60)) {
        const { bars } = chordSongBars({ seed, level, waltz: seed % 2 === 0 });
        // the first four bars do not simply come round again as the next four and the next
        expect(
          bars.slice(0, 4).join() === bars.slice(4, 8).join() &&
            bars.slice(0, 4).join() === bars.slice(8, 12).join(),
        ).toBe(false);
        distinctChords += new Set(bars).size;
      }
      expect(distinctChords / 60, level).toBeGreaterThanOrEqual(level === 'easy' ? 3 : 4);
    }
  });

  it('grooves differ from seed to seed at every level and for every instrument', () => {
    for (const profile of GROOVE_PROFILES) {
      for (const level of MELODY_LEVELS) {
        expect(
          distinct((seed) => generateGroove(profile, { seed, level }).notes),
          `${profile} ${level}`,
        ).toBeGreaterThan(20);
      }
    }
  });
});
