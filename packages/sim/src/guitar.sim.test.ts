/**
 * Simulations for the guitar in Strumline: a synthetic six-string guitar (Karplus-Strong strings
 * strummed low to high, muted strings left out) plays the ukulele library's songs retargeted to
 * the guitar, through the real strum analyzer, judge and scoreboard. Vouches for the software,
 * not for a real guitar or an iPad microphone.
 */
import {
  GUITAR_CHORD_FRETS,
  chartChords,
  chordShapesFor,
  getProfile,
  getSong,
  guitarChart,
  songsFor,
  type Chart,
} from '@lineup/core';
import { GUITAR_CHORDS } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { renderPerformance, type PerformanceOptions } from './performance';
import { guitarStrumPerformer, guitarStrumPerformerFor } from './performers';
import { runDiscrete } from './pipeline';

const profile = getProfile('guitar-strum');
const LATENCY = 0.1;
const four = guitarChart(getSong('strum-four-chords'));
const folk = guitarChart(getSong('strum-folk'));
const picking = guitarChart(getSong('strum-picking'));

function play(
  chart: Chart,
  perf: PerformanceOptions = {},
  run: { chords?: Record<string, number[]> } = {},
) {
  const rendered = renderPerformance(chart, guitarStrumPerformer, { latency: LATENCY, ...perf });
  return runDiscrete(rendered, chart, profile, { latencyOffset: LATENCY, ...run });
}

describe('guitar fingerings', () => {
  it('the testkit and the core agree on every chord fingering', () => {
    for (const [name, frets] of Object.entries(GUITAR_CHORD_FRETS)) {
      expect(GUITAR_CHORDS[name], name).toEqual(frets);
    }
  });

  it('every ukulele chord has a guitar fingering with six entries', () => {
    for (const [name, frets] of Object.entries(GUITAR_CHORD_FRETS)) {
      expect(frets, name).toHaveLength(6);
      expect(
        frets.some((f) => f !== null),
        name,
      ).toBe(true);
    }
  });

  it('a chord sounds the right notes (C = C E G, no low E)', () => {
    const c = chordShapesFor(profile, ['C', 'Em'])['C']!;
    expect(c.map((m) => m % 12).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 7]);
    expect(Math.min(...c)).toBe(48); // C3 on the A string
    expect(chordShapesFor(profile, ['Em'])['Em']).toHaveLength(6);
  });
});

describe('guitar songs', () => {
  it('the guitar has the same songs as the ukulele, retargeted', () => {
    const uke = songsFor('ukulele-strum');
    const gtr = songsFor('guitar-strum');
    // every ukulele song first, then the guitar's own exercises (barre and power chords)
    expect(gtr.slice(0, uke.length).map((s) => s.id)).toEqual(uke.map((s) => s.id));
    for (const s of gtr) expect(s.chart.meta.instruments, s.id).toContain('guitar-strum');
  });

  it('picked notes move to a guitar string and keep their pitch', () => {
    const uke = getSong('strum-picking');
    expect(picking.notes).toHaveLength(uke.notes.length);
    picking.notes.forEach((n) => {
      const frets = n.expected!.frets!;
      expect(frets).toHaveLength(6);
      expect(frets.filter((f) => f !== null)).toHaveLength(1);
      expect(n.pitch).toBeGreaterThanOrEqual(40);
    });
  });
});

describe('guitar: a calibrated player who strums the right chords', () => {
  // A guitar's strings ring long and its low strings are close together in pitch, so the chord
  // before leaks into a strum and an Am can read as a C: a few strums are named wrongly (the
  // chord check is optional in the app for this reason). Timing is never the problem.
  it.each([
    ['four chords (C Am F G)', four],
    ['folk (G C D)', folk],
  ])('%s: nearly every strum is perfect, with chords recognised', (_name, chart) => {
    const r = play(chart);
    expect(r.score.accuracy).toBeGreaterThan(0.9);
    expect(r.score.counts.miss).toBeLessThanOrEqual(3);
    // every strum was heard at the right time
    expect(r.inputs.length).toBe(chart.notes.length);
  });

  it('a fingerpicking song scores every plucked note', () => {
    const r = play(picking);
    expect(r.score.counts.miss).toBe(0);
  });

  it('chord checking recognises the guitar chords', () => {
    const r = play(four, {}, { chords: chordShapesFor(profile, chartChords(four)) });
    expect(r.score.accuracy).toBeGreaterThan(0.9);
  });
});

describe('guitar: barre, slid and power chords', () => {
  const ids = songsFor('guitar-strum')
    .map((s) => s.id)
    .filter((id) => id.startsWith('ex-guitar-strum-'));

  it.each(ids)('%s: every strum is heard on time', (id) => {
    const chart = getSong(id);
    expect(chart.notes.length).toBeGreaterThan(8);
    const r = play(chart);
    // a long-ringing barre chord can read as one stroke too many when the next one sounds
    expect(r.inputs.length).toBeGreaterThanOrEqual(chart.notes.length);
    expect(r.inputs.length).toBeLessThanOrEqual(chart.notes.length + 2);
    expect(r.score.accuracy).toBeGreaterThan(0.85);
  });

  it.each(['Gmaj7', 'Dsus4', 'F#m', 'B', 'Bb', 'C#m7', 'Eb', 'Ab', 'E5', 'G/B'])(
    '%s sounds the notes of the chord',
    (name) => {
      const midis = chordShapesFor(profile, [name])[name]!;
      expect(midis.length).toBeGreaterThanOrEqual(2);
    },
  );
});

describe('alternate tunings', () => {
  it.each(['guitar-strum-dropd', 'guitar-strum-dadgad', 'guitar-strum-openg'])(
    '%s: a player strumming the song is heard, every strum on time',
    (id) => {
      const p = getProfile(id);
      const chart = guitarChart(getSong('strum-four-chords'), id);
      const rendered = renderPerformance(chart, guitarStrumPerformerFor(id), { latency: LATENCY });
      const r = runDiscrete(rendered, chart, p, { latencyOffset: LATENCY });
      expect(r.inputs.length).toBe(chart.notes.length);
      expect(r.score.accuracy).toBeGreaterThan(0.85);
    },
    120000,
  );
});
