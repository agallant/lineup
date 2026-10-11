import { describe, expect, it } from 'vitest';
import { chartFromBeats } from './chart';
import { isDiatonic, rateChart, ratingText, starString } from './difficulty';
import { generateChordSong, generateGroove, generateMelody, MELODY_LEVELS } from './generate';
import { builtinSongs, getSong } from './songs';

const rate = (id: string) => rateChart(getSong(id));

describe('rateChart', () => {
  it('rates every built-in song and exercise from 1 to 10 in five bands', () => {
    for (const [id, chart] of Object.entries(builtinSongs)) {
      const r = rateChart(chart);
      expect(r.score, id).toBeGreaterThanOrEqual(1);
      expect(r.score, id).toBeLessThanOrEqual(10);
      expect(r.stars, id).toBe(Math.ceil(r.score / 2));
      expect(r.label).toBe(['Beginner', 'Easy', 'Medium', 'Hard', 'Expert'][r.stars - 1]);
    }
  });

  it('knows what kind of chart it is', () => {
    expect(rate('wind-ode').kind).toBe('melody');
    expect(rate('strum-picking').kind).toBe('picked');
    expect(rate('strum-fifties').kind).toBe('chords');
    expect(rate('kit-disco').kind).toBe('rhythm');
  });

  it('rates the easy tunes easier than a harder, chromatic one', () => {
    expect(rate('wind-ode').score).toBeLessThan(rate('wind-greensleeves').score);
    expect(rate('wind-mary-lamb').score).toBeLessThan(rate('wind-greensleeves').score);
    expect(rate('wind-greensleeves').stars).toBeGreaterThanOrEqual(3);
  });

  it('rates a steady quarter-note clap easier than a busy drum groove', () => {
    expect(rate('ex-clap-quarters').score).toBeLessThan(rate('kit-rock-fill').score);
    expect(rate('ex-clap-quarters').stars).toBe(1);
  });

  it('rates a one-chord, simple strum easier than a quick progression with sevenths', () => {
    expect(rate('strum-skip-lou').score).toBeLessThanOrEqual(rate('strum-fifties').score);
    expect(rate('strum-skip-lou').score).toBeLessThan(rate('strum-blues').score + 1);
  });

  it('rates the harder random levels harder on average', () => {
    const seeds = Array.from({ length: 12 }, (_, i) => i * 977 + 3);
    const avg = (f: (seed: number, level: (typeof MELODY_LEVELS)[number]) => number) =>
      MELODY_LEVELS.map((level) => seeds.reduce((a, s) => a + f(s, level), 0) / seeds.length);
    for (const averages of [
      avg(
        (seed, level) => rateChart(generateMelody('voice', { seed, scale: 'major', level })).score,
      ),
      avg((seed, level) => rateChart(generateChordSong({ seed, level })).score),
      avg((seed, level) => rateChart(generateGroove('drum-kit', { seed, level })).score),
    ]) {
      expect(averages[0]!).toBeLessThan(averages[1]!);
      expect(averages[1]!).toBeLessThanOrEqual(averages[2]! + 0.001);
      expect(averages[0]!).toBeLessThan(averages[2]!);
    }
  });

  it('rates an empty or single-note chart as the easiest, without failing', () => {
    const one = chartFromBeats({ title: 't', bpm: 80 }, [{ beat: 0, beats: 1, pitch: 60 }]);
    expect(rateChart(one).score).toBe(1);
    expect(rateChart({ ...one, notes: [] }).score).toBe(1);
  });
});

describe('diatonic or chromatic', () => {
  it('calls a melody diatonic when every note is in the major scale of its key', () => {
    expect(rate('wind-ode').scale).toBe('diatonic');
    expect(rate('ex-voice-minor-up-down').scale).toBe('diatonic'); // a mode of the parent major
    expect(rate('ex-wind-major-pentatonic-up-down').scale).toBe('diatonic');
  });

  it('calls a melody with sharps or flats chromatic', () => {
    expect(rate('wind-greensleeves').scale).toBe('chromatic');
    expect(rate('ex-wind-chromatic-up-down').scale).toBe('chromatic');
    expect(rate('ex-ukulele-strum-chromatic-up-down').scale).toBe('chromatic');
  });

  it('says nothing about scale for songs that are not melodies', () => {
    expect(rate('strum-fifties').scale).toBeNull();
    expect(rate('kit-disco').scale).toBeNull();
  });

  it('judges a song with no stated key by whether any major key holds all its notes', () => {
    expect(isDiatonic([62, 64, 66, 67], undefined)).toBe(true); // G major
    expect(isDiatonic([60, 61, 62, 63, 64, 65], undefined)).toBe(false);
    expect(isDiatonic([], 60)).toBe(true);
    expect(isDiatonic([61], 60)).toBe(false);
  });
});

describe('how a rating reads', () => {
  it('draws the stars and joins the parts', () => {
    expect(starString(2)).toBe('★★☆☆☆');
    expect(starString(5)).toBe('★★★★★');
    expect(
      ratingText({ score: 3, stars: 2, label: 'Easy', kind: 'melody', scale: 'diatonic' }),
    ).toBe('Easy ★★☆☆☆ · diatonic');
    expect(ratingText({ score: 7, stars: 4, label: 'Hard', kind: 'chords', scale: null })).toBe(
      'Hard ★★★★☆',
    );
  });
});
