import { describe, expect, it } from 'vitest';
import { UKULELE_CHORD_FRETS } from '../chords';
import { chartKind, isDiatonic, notePitch, rateChart } from '../difficulty';
import { builtinSongs, getSong } from '../songs';
import { VARIATIONS, VARIATION_LABELS, isVariation, varyChart } from './variations';
import { generateChordSong, generateGroove, generateMelody } from './index';

const all = Object.entries(builtinSongs);
const score = (id: string, v: 'original' | 'easier' | 'harder', seed = 7) =>
  rateChart(varyChart(getSong(id), v, seed)).score;

describe('easier chord songs with nothing on the beat', () => {
  it('keep their strokes instead of failing', () => {
    const chord = generateChordSong({ seed: 3, level: 'medium' });
    const spb = 60 / chord.meta.bpm;
    // keep only the strokes that fall between the beats
    const offbeat = {
      ...chord,
      notes: chord.notes.filter((n) => Math.abs(((n.t / spb) % 1) - 0.5) < 0.05),
    };
    expect(offbeat.notes.length).toBeGreaterThan(8);
    const easier = varyChart(offbeat, 'easier', 1);
    expect(easier.notes.length).toBe(offbeat.notes.length);
  });
});

describe('mixed versions', () => {
  it('take each phrase from the easier, original or harder version, at the original tempo', () => {
    for (const [id, chart] of all) {
      const mixed = varyChart(chart, 'mixed', 5);
      expect(mixed.meta.bpm, id).toBe(chart.meta.bpm);
      expect(mixed.notes.length, id).toBeGreaterThan(1);
      for (let i = 1; i < mixed.notes.length; i++)
        expect(mixed.notes[i]!.t, `${id} #${i}`).toBeGreaterThanOrEqual(mixed.notes[i - 1]!.t);
    }
  });

  it('is repeatable, differs by seed, and mixes: not simply the original', () => {
    const song = getSong('sing-silent-night');
    expect(varyChart(song, 'mixed', 2)).toEqual(varyChart(song, 'mixed', 2));
    const shapes = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(varyChart(song, 'mixed', s).notes)),
    );
    expect(shapes.size).toBeGreaterThan(2);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      expect(JSON.stringify(varyChart(song, 'mixed', seed).notes)).not.toBe(
        JSON.stringify(song.notes),
      );
    }
  });

  it('never leaves a phrase empty, even when its easier version has no strokes on the beat', () => {
    // every stroke of the second phrase is an off-beat up-stroke, which "easier" would drop
    const chord = generateChordSong({ seed: 8, level: 'medium' });
    const spb = 60 / chord.meta.bpm;
    const barLen = spb * 4;
    const odd = {
      ...chord,
      notes: chord.notes.map((n) =>
        n.t >= barLen * 2 && n.t < barLen * 4
          ? { ...n, t: Math.round((n.t + spb / 2) * 1e6) / 1e6 }
          : n,
      ),
    };
    for (let seed = 1; seed <= 12; seed++) {
      const mixed = varyChart(odd, 'mixed', seed);
      const inSecond = mixed.notes.filter((n) => n.t >= barLen * 2 && n.t < barLen * 4);
      expect(inSecond.length, `seed ${seed}`).toBeGreaterThan(0);
    }
  });

  it('keeps chord songs and grooves valid', () => {
    for (const chart of [
      generateChordSong({ seed: 8, level: 'hard' }),
      generateChordSong({ seed: 8, level: 'medium', waltz: true }),
      generateGroove('drum-kit', { seed: 8, level: 'hard' }),
      generateMelody('voice', { seed: 8, scale: 'major', level: 'hard' }),
    ]) {
      const mixed = varyChart(chart, 'mixed', 9);
      expect(rateChart(mixed).score).toBeGreaterThanOrEqual(1);
      expect(chartKind(mixed)).toBe(chartKind(chart));
    }
  });
});

describe('varyChart', () => {
  it('is the song itself for "original", and the same result every time otherwise', () => {
    const c = getSong('wind-greensleeves');
    expect(varyChart(c, 'original')).toBe(c);
    for (const v of ['easier', 'harder'] as const) {
      expect(varyChart(c, v, 3)).toEqual(varyChart(c, v, 3));
    }
  });

  it('keeps every song valid, in order, and for the same instrument and key', () => {
    for (const [id, chart] of all) {
      for (const v of ['easier', 'harder'] as const) {
        const out = varyChart(chart, v, 11);
        expect(out.notes.length, `${id} ${v}`).toBeGreaterThan(1);
        expect(out.meta.instruments, id).toEqual(chart.meta.instruments);
        expect(out.meta.tonic, id).toBe(chart.meta.tonic);
        for (let i = 1; i < out.notes.length; i++) {
          expect(out.notes[i]!.t, `${id} ${v} #${i}`).toBeGreaterThanOrEqual(out.notes[i - 1]!.t);
        }
      }
    }
  });

  it('makes songs easier or harder to play on the whole, never easier than easier', () => {
    let easier = 0;
    let original = 0;
    let harder = 0;
    let changed = 0;
    for (const [id, chart] of all) {
      const o = rateChart(chart).score;
      const e = score(id, 'easier');
      const h = score(id, 'harder');
      easier += e;
      original += o;
      harder += h;
      expect(e, `${id} easier`).toBeLessThanOrEqual(o);
      expect(h, `${id} harder`).toBeGreaterThanOrEqual(o - 1);
      if (e !== o || h !== o) changed++;
    }
    expect(easier).toBeLessThan(original);
    expect(original).toBeLessThan(harder);
    expect(changed / all.length).toBeGreaterThan(0.4);
  });

  it('works on random songs too, and a seed gives a different harder version', () => {
    const songs = [
      generateMelody('voice', { seed: 5, scale: 'major', level: 'medium' }),
      generateChordSong({ seed: 5, level: 'medium' }),
      generateGroove('drum-kit', { seed: 5, level: 'medium' }),
    ];
    for (const s of songs) {
      expect(rateChart(varyChart(s, 'easier', 1)).score).toBeLessThanOrEqual(rateChart(s).score);
      expect(rateChart(varyChart(s, 'harder', 1)).score).toBeGreaterThanOrEqual(rateChart(s).score);
    }
    const seeds = new Set(
      Array.from({ length: 10 }, (_, i) =>
        JSON.stringify(varyChart(getSong('sing-silent-night'), 'harder', i).notes),
      ),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it('leaves a single-note chart alone', () => {
    const c = getSong('clap-basic');
    const one = { ...c, notes: c.notes.slice(0, 1) };
    expect(varyChart(one, 'harder')).toBe(one);
  });
});

describe('melody variations', () => {
  it('easier turns sharps and flats into scale notes, so a chromatic song becomes diatonic', () => {
    const c = getSong('wind-greensleeves');
    expect(rateChart(c).scale).toBe('chromatic');
    const e = varyChart(c, 'easier');
    expect(rateChart(e).scale).toBe('diatonic');
    expect(
      isDiatonic(
        e.notes.map((n) => n.pitch!),
        e.meta.tonic,
      ),
    ).toBe(true);
  });

  it('harder only adds notes from the key, between or beside the original ones', () => {
    const c = getSong('wind-ode');
    const h = varyChart(c, 'harder', 4);
    expect(h.notes.length).toBeGreaterThan(c.notes.length);
    expect(rateChart(h).scale).toBe('diatonic');
    const original = c.notes.map((n) => n.pitch!);
    const lo = Math.min(...original);
    const hi = Math.max(...original) + 3;
    for (const n of h.notes) {
      expect(n.pitch!).toBeGreaterThanOrEqual(lo);
      expect(n.pitch!).toBeLessThanOrEqual(hi);
    }
  });

  it('keeps a gap after every sounded note, so repeated and neighbouring notes stay separate', () => {
    for (const id of [
      'wind-mary-lamb',
      'sing-silent-night',
      'wind-greensleeves',
      'ex-wind-major-thirds',
    ]) {
      for (const v of ['easier', 'harder'] as const) {
        const out = varyChart(getSong(id), v, 2);
        for (let i = 1; i < out.notes.length; i++) {
          const prev = out.notes[i - 1]!;
          expect(out.notes[i]!.t, `${id} ${v} #${i}`).toBeGreaterThan(prev.t + prev.duration);
        }
      }
    }
  });

  it('plucked ukulele melodies stay on one string, within the first frets', () => {
    for (const id of ['pick-mary-lamb', 'pick-ode-to-joy', 'ex-ukulele-strum-major-thirds']) {
      for (const v of ['easier', 'harder'] as const) {
        const out = varyChart(getSong(id), v, 5);
        expect(chartKind(out)).toBe('picked');
        for (const n of out.notes) {
          expect(n.expected!.frets!.filter((f) => f !== null)).toHaveLength(1);
          expect(Math.max(...n.expected!.frets!.map((f) => f ?? 0))).toBeLessThanOrEqual(7);
          expect(notePitch(n)).not.toBeNull();
        }
      }
    }
  });
});

describe('chord song variations', () => {
  it('easier has strokes on the beat only and no sevenths, every chord with a fingering', () => {
    const c = getSong('strum-blues');
    const e = varyChart(c, 'easier');
    const spb = 60 / e.meta.bpm;
    for (const n of e.notes) {
      expect(Math.abs(n.t / spb - Math.round(n.t / spb))).toBeLessThan(0.06);
      expect(n.expected!.chord!).not.toMatch(/7$/);
      expect(UKULELE_CHORD_FRETS[n.expected!.chord!]).toBeDefined();
    }
    expect(e.notes.length).toBeLessThan(c.notes.length);
  });

  it('harder adds up-strokes only where the same chord goes on, with half a beat between strokes', () => {
    const c = getSong('strum-skip-lou');
    const h = varyChart(c, 'harder', 3);
    expect(h.notes.length).toBeGreaterThan(c.notes.length);
    const spb = 60 / h.meta.bpm;
    h.notes.forEach((n, i) => {
      const next = h.notes[i + 1];
      if (next) expect((next.t - n.t) / spb).toBeGreaterThan(0.49);
      if (n.expected?.direction === 'up' && !c.notes.some((o) => Math.abs(o.t - n.t) < 1e-6)) {
        expect(next === undefined || next.expected?.chord === n.expected.chord).toBe(true);
      }
    });
  });
});

describe('rhythm variations', () => {
  it('easier keeps the hits on the beat', () => {
    const c = getSong('kit-rock-fill');
    const e = varyChart(c, 'easier');
    const spb = 60 / e.meta.bpm;
    for (const n of e.notes) expect(Math.abs(n.t / spb - Math.round(n.t / spb))).toBeLessThan(0.06);
    expect(e.notes.length).toBeLessThan(c.notes.length);
  });

  it('harder adds hits between the beats but never straight after a kick, and no two closer than half a beat', () => {
    for (const id of ['kit-halftime', 'hand-heartbeat', 'clap-gallop']) {
      const c = getSong(id);
      const h = varyChart(c, 'harder', 9);
      const spb = 60 / h.meta.bpm;
      h.notes.forEach((n, i) => {
        const prev = h.notes[i - 1];
        if (prev) expect((n.t - prev.t) / spb, `${id} #${i}`).toBeGreaterThan(0.49);
        if (prev?.lane === 'kick' && (n.t - prev.t) / spb < 0.9) {
          // a hit within a beat of a kick was already in the song
          expect(c.notes.some((o) => Math.abs(o.t * (h.meta.bpm / c.meta.bpm) - n.t) < 1e-3)).toBe(
            true,
          );
        }
      });
    }
  });
});

describe('the variation list', () => {
  it('has a label for each and recognises only its own names', () => {
    for (const v of VARIATIONS) expect(VARIATION_LABELS[v]).toBeTruthy();
    expect(isVariation('harder')).toBe(true);
    expect(isVariation('hardest')).toBe(false);
    expect(isVariation(3)).toBe(false);
  });
});
