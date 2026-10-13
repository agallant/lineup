import { describe, expect, it } from 'vitest';
import { rateChart } from '../difficulty';
import { getSong, songCategory, songsFor } from '../songs';
import { checkFit, findWindInstrument, instrumentRoot } from '../wind-instruments';
import {
  FLUTE_SCALES,
  fluteId,
  generateFluteSong,
  isFluteScale,
  parseFluteId,
  type FluteSpec,
} from './flute';
import { MELODY_LEVELS } from './melody';

const SEEDS = Array.from({ length: 120 }, (_, i) => i * 977 + 3);
const specs = (seed: number): FluteSpec[] =>
  FLUTE_SCALES.flatMap((scale) => MELODY_LEVELS.map((level) => ({ seed, scale, level })));

/** The notes of the pentatonic scale on A (minor) or C (major), as pitch classes. */
const A_MINOR = new Set([9, 0, 2, 4, 7]);

describe('generateFluteSong', () => {
  it('stays on the five notes of the scale, never below the lowest note of an A flute', () => {
    for (const seed of SEEDS) {
      for (const spec of specs(seed)) {
        const chart = generateFluteSong(spec);
        expect(chart.meta.instruments).toEqual(['wind']);
        expect(chart.meta.tonic).toBe(72);
        for (const n of chart.notes) {
          // minor and major pentatonic on A and C hold the same five notes
          expect(A_MINOR.has(n.pitch! % 12), `${fluteId(spec)} ${n.pitch}`).toBe(true);
          expect(n.pitch!, fluteId(spec)).toBeGreaterThanOrEqual(69);
        }
      }
    }
  });

  it('can be played in full on every pentatonic flute, in its own key', () => {
    const flutes = ['naf-a', 'naf-d', 'naf-c', 'shaku-18'].map((id) => findWindInstrument(id)!);
    for (const seed of SEEDS.slice(0, 30)) {
      for (const spec of specs(seed)) {
        const chart = generateFluteSong(spec);
        for (const flute of flutes) {
          // moved so the lowest possible note (A4) is the flute's root, every note has a fingering
          const base = instrumentRoot(flute) - 69;
          const fit = checkFit(
            chart.notes.map((n) => n.pitch! + base),
            flute,
          );
          expect(fit, `${fluteId(spec)} on ${flute.id}`).toEqual({
            outOfRange: [],
            noFingering: [],
          });
        }
      }
    }
  });

  it('breathes: phrases are slow, with rests between them, and the last note is held', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      for (const spec of specs(seed)) {
        const chart = generateFluteSong(spec);
        const spb = 60 / chart.meta.bpm;
        expect(chart.meta.bpm).toBeLessThanOrEqual(72);
        // a gap of a beat or more at least three times (the breaths between four phrases)
        const gaps = chart.notes.filter(
          (n, i) =>
            i > 0 && n.t - (chart.notes[i - 1]!.t + chart.notes[i - 1]!.duration) >= spb - 1e-6,
        );
        expect(gaps.length, fluteId(spec)).toBeGreaterThanOrEqual(3);
        const last = chart.notes.at(-1)!;
        expect(last.duration / spb, fluteId(spec)).toBeGreaterThan(3);
        // it comes home: the last note is the lowest of the scale or its octave
        expect(
          [69, 81, 72, 84].includes(last.pitch!),
          `${fluteId(spec)} ends on ${last.pitch}`,
        ).toBe(true);
      }
    }
  });

  it('is the same for the same spec, and different across seeds at every level', () => {
    const a = generateFluteSong({ seed: 4, scale: 'minor-pentatonic', level: 'medium' });
    expect(generateFluteSong({ seed: 4, scale: 'minor-pentatonic', level: 'medium' })).toEqual(a);
    for (const scale of FLUTE_SCALES) {
      for (const level of MELODY_LEVELS) {
        const many = new Set(
          SEEDS.map((seed) =>
            generateFluteSong({ seed, scale, level })
              .notes.map((n) => `${n.t}:${n.pitch}`)
              .join(),
          ),
        );
        expect(many.size, `${scale} ${level}`).toBeGreaterThan(80);
      }
    }
  });

  it('rates harder at the harder levels', () => {
    const avg = (level: (typeof MELODY_LEVELS)[number]) =>
      SEEDS.reduce(
        (a, seed) =>
          a + rateChart(generateFluteSong({ seed, scale: 'minor-pentatonic', level })).score,
        0,
      ) / SEEDS.length;
    expect(avg('easy')).toBeLessThan(avg('medium'));
    expect(avg('medium')).toBeLessThan(avg('hard'));
  });

  it('has ids that round-trip, and getSong builds them', () => {
    const spec: FluteSpec = { seed: 1234, scale: 'major-pentatonic', level: 'hard' };
    expect(fluteId(spec)).toBe('gen-flute-major-pentatonic-hard-1234');
    expect(parseFluteId('gen-flute-major-pentatonic-hard-1234')).toEqual(spec);
    expect(getSong('gen-flute-major-pentatonic-hard-1234')).toEqual(generateFluteSong(spec));
    for (const bad of [
      'gen-flute-major-hard-1234',
      'gen-flute-dorian-easy-1',
      'gen-flute-minor-pentatonic-bold-1',
      'gen-flute-minor-pentatonic-easy-100000',
      'gen-flute-minor-pentatonic-easy-01',
    ])
      expect(parseFluteId(bad), bad).toBeNull();
    expect(isFluteScale('dorian')).toBe(false);
    // a generated flute song is filed with the flute songs, so a link to one picks a flute
    expect(songCategory('gen-flute-minor-pentatonic-easy-77')).toBe('flute');
    expect(songCategory('gen-wind-major-easy-77')).toBe('song');
  });
});

describe('the flute songs', () => {
  const flute = songsFor('wind').filter((s) => s.category === 'flute');

  it('are filed as flute songs for Windline only', () => {
    expect(flute.length).toBeGreaterThanOrEqual(8);
    expect(flute.every((s) => s.id.startsWith('flute-'))).toBe(true);
    expect(songsFor('voice').some((s) => s.id.startsWith('flute-'))).toBe(false);
    expect(
      songsFor('wind')
        .filter((s) => s.category === 'song')
        .every((s) => !s.id.startsWith('flute-')),
    ).toBe(true);
  });

  it('use only the five notes of the pentatonic scale, from the lowest note of an A flute up', () => {
    for (const { id, chart } of flute) {
      expect(chart.meta.tonic, id).toBe(72);
      for (const n of chart.notes) {
        expect(A_MINOR.has(n.pitch! % 12), `${id} ${n.pitch}`).toBe(true);
        expect(n.pitch!, id).toBeGreaterThanOrEqual(69);
        expect(n.pitch!, id).toBeLessThanOrEqual(93);
      }
      // each ends on a tonic of its mood: the flute's lowest note, or the major tonic above
      expect([69, 72, 81].includes(chart.notes.at(-1)!.pitch!), id).toBe(true);
    }
  });

  it('are fingered on every pentatonic flute once moved into its key', () => {
    for (const { id, chart } of flute) {
      for (const inst of ['naf-a', 'naf-e', 'naf-c', 'shaku-18', 'shaku-21']) {
        const flute = findWindInstrument(inst)!;
        const shift = flute.tonic - 72;
        const fit = checkFit(
          chart.notes.map((n) => n.pitch! + shift),
          flute,
        );
        expect(fit, `${id} on ${inst}`).toEqual({ outOfRange: [], noFingering: [] });
      }
    }
  });

  it('get harder: the last few rate no easier than the first few', () => {
    const scores = flute.map((s) => rateChart(s.chart).score);
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(scores.slice(-3))).toBeGreaterThanOrEqual(mean(scores.slice(0, 3)));
  });
});
