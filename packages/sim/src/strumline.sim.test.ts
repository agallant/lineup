/**
 * End-to-end simulations for Strumline's chord recognition: a synthetic
 * ukulele (Karplus-Strong strings strummed in order, with body resonance)
 * plays a song; the audio goes through the real strum analyzer, clock,
 * discrete judge (timing + chord) and scoreboard. Vouches for the software,
 * not for a real ukulele, a real strumming hand or an iPad microphone.
 */
import {
  UKULELE_CHORD_FRETS,
  chartChords,
  chordShapesFor,
  getProfile,
  getSong,
  loadChart,
  type Chart,
  type ChartNote,
} from '@lineup/core';
import { UKE_CHORDS } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { renderPerformance, type PerformanceOptions } from './performance';
import { ukuleleStrumPerformer } from './performers';
import { runDiscrete } from './pipeline';

const profile = getProfile('ukulele-strum');
const LATENCY = 0.1;

const four = getSong('strum-four-chords');
const folk = getSong('strum-folk');

const rescale = (c: Chart, bpm: number): Chart => {
  const f = c.meta.bpm / bpm;
  const r = loadChart({
    ...c,
    meta: { ...c.meta, bpm },
    notes: c.notes.map((n) => ({ ...n, t: n.t * f, duration: n.duration * f })),
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.value;
};

function play(
  chart: Chart,
  perf: PerformanceOptions = {},
  run: { chords?: Record<string, number[]> } = {},
) {
  const rendered = renderPerformance(chart, ukuleleStrumPerformer, { latency: LATENCY, ...perf });
  return runDiscrete(rendered, chart, profile, { latencyOffset: LATENCY, ...run });
}

describe('strum songs and fingerings', () => {
  it('the testkit and the core agree on every chord fingering', () => {
    for (const [name, frets] of Object.entries(UKULELE_CHORD_FRETS)) {
      expect(UKE_CHORDS[name], name).toEqual(frets);
    }
  });
});

describe('strumline: a calibrated player who strums the right chords', () => {
  it.each([
    ['four chords (C Am F G), 100 bpm', four],
    ['folk (G C D), 96 bpm', folk],
  ])('%s scores every strum perfect', (_name, chart) => {
    const r = play(chart);
    expect(r.score.counts).toEqual({ perfect: 48, good: 0, miss: 0 });
    expect(r.score.accuracy).toBeGreaterThan(0.98);
    // every event carried the chord the analyzer recognised, or none at all: never a wrong one
    const wrong = r.inputs.filter((e) => e.chord !== undefined).length;
    expect(wrong).toBeGreaterThan(40);
  });

  it.each([70, 130, 160, 200])('keeps up at %d bpm', (bpm) => {
    const r = play(rescale(four, bpm));
    expect(r.score.counts).toEqual({ perfect: 48, good: 0, miss: 0 });
  });

  it('still hits in 40 dBFS room noise, with 15 ms of timing jitter', () => {
    const r = play(four, { noise: { rmsDb: -40, seed: 5 }, jitter: 0.015, seed: 3 });
    expect(r.score.counts.miss).toBe(0);
    expect(r.score.counts.perfect + r.score.counts.good).toBe(48);
  });

  it('results do not depend on where the AudioContext clock starts', () => {
    const a = play(four, { ctxStart: 0 });
    const b = play(four, { ctxStart: 12345.678 });
    expect(b.score.counts).toEqual(a.score.counts);
    expect(b.inputs.map((e) => e.chord)).toEqual(a.inputs.map((e) => e.chord));
  });
});

describe('strumline: playing the wrong chord', () => {
  // the last two bars should be G; the player strums F instead (notes 36..47)
  const wrongFromBar7 = (note: ChartNote, index: number): ChartNote =>
    index >= 36 ? { ...note, expected: { ...note.expected, chord: 'F' } } : note;

  it('misses exactly those strums, with the reason, and keeps the rest', () => {
    const r = play(four, { override: wrongFromBar7 });
    const misses = r.judgments.filter((j) => j.grade === 'miss');
    expect(misses.map((j) => j.noteIndex)).toEqual(Array.from({ length: 12 }, (_, i) => 36 + i));
    expect(new Set(misses.map((j) => j.reason))).toEqual(new Set(['wrong-chord']));
    expect(r.score.counts.perfect).toBe(36);
  });

  it('is not penalised when chord checking is off (timing only)', () => {
    const r = play(four, { override: wrongFromBar7 }, { chords: {} });
    expect(r.score.counts).toEqual({ perfect: 48, good: 0, miss: 0 });
    expect(r.inputs.every((e) => e.chord === undefined)).toBe(true);
  });

  it('a silent bar is missed as no-input, not as a wrong chord', () => {
    const r = play(four, { skip: Array.from({ length: 6 }, (_, i) => 12 + i) });
    const misses = r.judgments.filter((j) => j.grade === 'miss');
    expect(misses).toHaveLength(6);
    expect(new Set(misses.map((j) => j.reason))).toEqual(new Set(['no-input']));
  });
});

describe('strumline: KNOWN LIMITATION, strums right after a chord change', () => {
  // The old chord is still ringing when the new one is strummed, so the first strum after a
  // quick change can read as the previous chord. Pinned so a change that fixes it is noticed.
  const demo = getSong('ukulele-strum-demo'); // changes chord every 12 strums, 100 bpm

  it('at 160 bpm at most the first strum after a change is read as the old chord', () => {
    const chart = rescale(demo, 160);
    const r = play(chart);
    const misses = r.judgments.filter((j) => j.grade === 'miss');
    expect(misses.length).toBeLessThanOrEqual(2);
    for (const m of misses) expect(m.reason).toBe('wrong-chord');
    // and on the beat after a change, not in the middle of a chord
    for (const m of misses) {
      expect(chart.notes[m.noteIndex]!.expected?.chord).not.toBe(
        chart.notes[m.noteIndex - 1]!.expected?.chord,
      );
    }
  });

  it('timing-only mode is unaffected', () => {
    const r = play(rescale(demo, 160), {}, { chords: {} });
    expect(r.score.counts).toEqual({ perfect: 24, good: 0, miss: 0 });
  });
});

describe('strumline: what the analyzer is given', () => {
  it('a song only needs its own chords', () => {
    expect(Object.keys(chordShapesFor(profile, chartChords(folk)))).toEqual(['G', 'C', 'D']);
  });
});
