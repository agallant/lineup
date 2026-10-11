import { describe, expect, it } from 'vitest';
import { checkFit } from '../wind-instruments';
import { WIND_INSTRUMENTS } from '../wind-instruments';
import { getSong } from '../songs';
import {
  MELODY_LEVELS,
  chordDegrees,
  generateMelody,
  isSeed,
  melodyId,
  melodyScalesFor,
  parseMelodyId,
  randomSeed,
  type MelodyLevel,
} from './melody';
import { EXERCISE_TONICS } from './exercises';
import { SCALES, SCALE_IDS, type ScaleId } from './theory';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 1657 + 3);

/** The degree (within the scale, octaves counted) of a pitch, or null if it is not in the scale. */
function degreeOf(pitch: number, scale: ScaleId, profile: string): number | null {
  const def = SCALES[scale];
  const parent = EXERCISE_TONICS[profile]!;
  const root =
    parent + (profile === 'wind' ? ((def.rootFromParent % 12) + 12) % 12 : def.rootFromParent);
  const n = def.steps.length;
  const rel = pitch - root;
  const oct = Math.floor(rel / 12);
  const i = def.steps.indexOf(((rel % 12) + 12) % 12);
  return i < 0 ? null : oct * n + i;
}

describe('generateMelody', () => {
  it('is deterministic and varies with the seed', () => {
    const a = generateMelody('voice', { seed: 5, scale: 'major', level: 'medium' });
    const b = generateMelody('voice', { seed: 5, scale: 'major', level: 'medium' });
    const c = generateMelody('voice', { seed: 6, scale: 'major', level: 'medium' });
    expect(a).toEqual(b);
    expect(a.notes.map((n) => n.pitch)).not.toEqual(c.notes.map((n) => n.pitch));
  });

  it('rejects an unknown profile', () => {
    expect(() => generateMelody('drums', { seed: 1, scale: 'major', level: 'easy' })).toThrow();
  });

  for (const profile of ['voice', 'wind']) {
    for (const scale of SCALE_IDS) {
      for (const level of MELODY_LEVELS) {
        it(`${profile} ${scale} ${level}: valid, in key, singable and ends at home`, () => {
          const def = SCALES[scale];
          const n = def.steps.length;
          const chord = chordDegrees(def);
          let steps = 0;
          let moves = 0;
          let strong = 0;
          let strongChord = 0;
          for (const seed of SEEDS) {
            const chart = generateMelody(profile, { seed, scale, level });
            const degrees = chart.notes.map((x) => degreeOf(x.pitch!, scale, profile));
            expect(degrees.every((d) => d !== null)).toBe(true);
            const ds = degrees as number[];
            // range: wind never below the tonic; within one octave of the root either way
            expect(Math.min(...ds)).toBeGreaterThanOrEqual(0);
            expect(Math.max(...ds)).toBeLessThanOrEqual(n);
            // no jump above the level's limit
            const limit = level === 'easy' ? 2 : level === 'medium' ? 3 : 4;
            // inside a phrase no jump is above the level's limit; between phrases, after a held
            // note, a jump may be a little bigger but never a ninth
            const bpb0 = 60 / chart.meta.bpm!;
            for (let i = 1; i < ds.length; i++) {
              const jump = Math.abs(ds[i]! - ds[i - 1]!);
              const beat = chart.notes[i]!.t / bpb0;
              if (Math.abs(beat / 8 - Math.round(beat / 8)) < 1e-6) {
                expect(jump).toBeLessThanOrEqual(5);
                continue;
              }
              expect(jump).toBeLessThanOrEqual(limit);
              moves++;
              if (jump <= 1) steps++;
            }
            // four phrases of eight beats, the last note held for a bar and on the tonic
            const bpb = 60 / chart.meta.bpm!;
            const last = chart.notes[chart.notes.length - 1]!;
            expect(last.t).toBeGreaterThan(31 * bpb - 4 * bpb);
            expect(last.duration).toBeGreaterThanOrEqual(3 * bpb);
            expect(((ds[ds.length - 1]! % n) + n) % n).toBe(0);
            // every phrase end is held for at least two beats
            const ends = [8, 16, 24].map((b) =>
              chart.notes.filter((x) => x.t < b * bpb - 1e-6).pop()!,
            );
            for (const e of ends) expect(e.duration).toBeGreaterThanOrEqual(1.7 * bpb);
            // strong beats are chord tones
            chart.notes.forEach((x, i) => {
              const beat = x.t / bpb;
              if (Math.abs(beat / 4 - Math.round(beat / 4)) < 1e-6) {
                strong++;
                if (chord.includes(((ds[i]! % n) + n) % n)) strongChord++;
              }
            });
          }
          // mostly stepwise (skips of a third are what chord tones on strong beats call for)
          expect(steps / moves).toBeGreaterThan(
            level === 'easy' ? 0.55 : level === 'medium' ? 0.5 : 0.4,
          );
          expect(strongChord / strong).toBeGreaterThan(0.9);
        });
      }
    }
  }

  it('repeats its phrases: the A phrases of an AABA melody match until their endings', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const chart = generateMelody('voice', { seed, scale: 'major', level: 'easy' });
      const bpb = 60 / chart.meta.bpm!;
      const phrase = (k: number) =>
        chart.notes.filter((x) => x.t >= k * 8 * bpb - 1e-6 && x.t < (k + 1) * 8 * bpb - 1e-6);
      const a1 = phrase(0);
      const a2 = phrase(1);
      expect(a2.length).toBe(a1.length);
      // everything but the ending (the last two notes may be adjusted) is the same
      expect(a2.slice(0, -2).map((x) => x.pitch)).toEqual(a1.slice(0, -2).map((x) => x.pitch));
      found++;
    }
    expect(found).toBe(SEEDS.length);
  });

  it('fits every whistle in a major key', () => {
    for (const level of MELODY_LEVELS) {
      for (const seed of SEEDS.slice(0, 10)) {
        const chart = generateMelody('wind', { seed, scale: 'major', level });
        const pitches = chart.notes.map((x) => x.pitch!);
        for (const inst of WIND_INSTRUMENTS.filter((i) => i.id.includes('whistle'))) {
          const shift = inst.tonic - chart.meta.tonic!;
          const fit = checkFit(
            pitches.map((p) => p + shift),
            inst,
          );
          expect(fit.outOfRange).toEqual([]);
          expect(fit.noFingering).toEqual([]);
        }
      }
    }
  });
});

describe('melodies on the ukulele', () => {
  const OPEN = [67, 60, 64, 69];
  const pitchOf = (frets: readonly (number | null)[]): number =>
    frets.flatMap((f, i) => (f === null ? [] : [OPEN[i]! + f]))[0]!;

  it('are plucked on single strings on the first frets, in key, for the scales that fit', () => {
    expect(melodyScalesFor('ukulele-strum')).toEqual(['major', 'dorian', 'major-pentatonic']);
    for (const scale of melodyScalesFor('ukulele-strum')) {
      for (const level of MELODY_LEVELS) {
        for (const seed of SEEDS.slice(0, 15)) {
          const chart = generateMelody('ukulele-strum', { seed, scale, level });
          expect(chart.meta.instruments).toEqual(['ukulele-strum']);
          expect(chart.notes.length).toBeGreaterThan(15);
          for (const n of chart.notes) {
            expect(n.pitch).toBeUndefined();
            expect(n.expected!.frets!.filter((f) => f !== null)).toHaveLength(1);
            expect(degreeOf(pitchOf(n.expected!.frets!), scale, 'voice')).not.toBeNull();
          }
        }
      }
    }
  });

  it('refuses a scale that goes below the C string', () => {
    expect(() =>
      generateMelody('ukulele-strum', { seed: 1, scale: 'minor', level: 'easy' }),
    ).toThrow(/first frets/);
  });

  it('has ids that name the ukulele and only its scales', () => {
    const spec = { seed: 7, scale: 'dorian' as const, level: 'easy' as MelodyLevel };
    expect(melodyId('ukulele-strum', spec)).toBe('gen-ukulele-strum-dorian-easy-7');
    expect(parseMelodyId('gen-ukulele-strum-dorian-easy-7')).toEqual({
      profileId: 'ukulele-strum',
      spec,
    });
    expect(parseMelodyId('gen-ukulele-strum-minor-easy-7')).toBeNull();
  });
});

describe('melody ids and seeds', () => {
  it('round-trips an id, and getSong builds the melody', () => {
    const spec = { seed: 4242, scale: 'dorian' as const, level: 'hard' as MelodyLevel };
    const id = melodyId('wind', spec);
    expect(id).toBe('gen-wind-dorian-hard-4242');
    expect(parseMelodyId(id)).toEqual({ profileId: 'wind', spec });
    expect(getSong(id)).toEqual(generateMelody('wind', spec));
  });

  it('refuses ids that are not melodies', () => {
    for (const bad of [
      'gen-wind-nope-hard-1',
      'gen-wind-major-extreme-1',
      'gen-wind-major-easy-100000',
      'gen-wind-major-easy-0042', // not the canonical form: one melody, one id
      'gen-guitar-major-easy-1',
      'gen-wind-major-easy-',
      'wind-twinkle',
    ])
      expect(parseMelodyId(bad)).toBeNull();
    expect(() => getSong('gen-wind-nope-hard-1')).toThrow();
  });

  it('knows valid seeds and draws them from a random source', () => {
    expect(isSeed(0)).toBe(true);
    expect(isSeed(99999)).toBe(true);
    expect(isSeed(100000)).toBe(false);
    expect(isSeed(-1)).toBe(false);
    expect(isSeed(1.5)).toBe(false);
    expect(isSeed('7')).toBe(false);
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999)).toBe(99999);
  });
});
