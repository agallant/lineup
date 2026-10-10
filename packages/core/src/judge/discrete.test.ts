import { describe, expect, it } from 'vitest';
import type { ChartNote } from '../chart';
import { midiToFrequency } from '../notes';
import type { InputEvent } from '../types';
import { getProfile } from '../profiles';
import { discreteConfigFromProfile } from './config';
import { DiscreteJudge, type DiscreteJudgeConfig } from './discrete';
import type { Grade, MissReason } from './types';

const note = (t: number, extra: Partial<ChartNote> = {}): ChartNote => ({
  t,
  duration: 0,
  ...extra,
});
const ev = (time: number, extra: Partial<InputEvent> = {}): InputEvent => ({
  time,
  kind: 'onset',
  ...extra,
});

const CFG: Partial<DiscreteJudgeConfig> = { perfectWindow: 0.05, goodWindow: 0.1 };

interface Case {
  name: string;
  notes: ChartNote[];
  events: InputEvent[];
  config?: Partial<DiscreteJudgeConfig>;
  /** [grade, timingErrorMs or null, reason or null] per note. */
  expected: [Grade, number | null, MissReason | null][];
  strays?: number;
}

const cases: Case[] = [
  {
    name: 'exact hits are perfect',
    notes: [note(1), note(2)],
    events: [ev(1), ev(2)],
    expected: [
      ['perfect', 0, null],
      ['perfect', 0, null],
    ],
  },
  {
    name: 'early and late within the perfect window',
    notes: [note(1), note(2)],
    events: [ev(0.96), ev(2.05)],
    expected: [
      ['perfect', -40, null],
      ['perfect', 50, null],
    ],
  },
  {
    name: 'between the windows is good',
    notes: [note(1), note(2)],
    events: [ev(0.92), ev(2.1)],
    expected: [
      ['good', -80, null],
      ['good', 100, null],
    ],
  },
  {
    name: 'just outside the good window misses and the event is a stray',
    notes: [note(1)],
    events: [ev(1.101)],
    expected: [['miss', null, 'no-input']],
    strays: 1,
  },
  {
    name: 'no input at all misses every note',
    notes: [note(1), note(2), note(3)],
    events: [],
    expected: [
      ['miss', null, 'no-input'],
      ['miss', null, 'no-input'],
      ['miss', null, 'no-input'],
    ],
  },
  {
    name: 'latency offset is subtracted (player + device are 80 ms late)',
    notes: [note(1), note(2)],
    events: [ev(1.08), ev(2.08)],
    config: { latencyOffset: 0.08 },
    expected: [
      ['perfect', 0, null],
      ['perfect', 0, null],
    ],
  },
  {
    name: 'without calibration the same 80 ms-late input is only good',
    notes: [note(1)],
    events: [ev(1.08)],
    expected: [['good', 80, null]],
  },
  {
    name: 'negative offset (an early player/device) is respected',
    notes: [note(1)],
    events: [ev(0.97)],
    config: { latencyOffset: -0.03 },
    expected: [['perfect', 0, null]],
  },
  {
    name: 'a double trigger hits once; the second is a stray',
    notes: [note(1), note(5)],
    events: [ev(1.0), ev(1.03)],
    expected: [
      ['perfect', 0, null],
      ['miss', null, 'no-input'],
    ],
    strays: 1,
  },
  {
    name: 'two close notes are assigned to the nearest unresolved note',
    notes: [note(1), note(1.15)],
    events: [ev(1.14), ev(1.01)],
    expected: [
      ['perfect', 10, null],
      ['perfect', -10, null],
    ],
  },
  {
    name: 'one hit between two notes takes the nearer one only',
    notes: [note(1), note(1.15)],
    events: [ev(1.1)],
    expected: [
      ['miss', null, 'no-input'],
      ['perfect', -50, null],
    ],
  },
  {
    name: 'a resolved note behind an unresolved one is not hit twice',
    notes: [note(1), note(1.08)],
    events: [ev(1.09), ev(1.085)],
    // 1.09 is nearest to the second note; 1.085 must then fall to the still-open first note (good, 85 ms), not re-hit the second
    expected: [
      ['good', 85, null],
      ['perfect', 10, null],
    ],
  },
  {
    name: 'with two notes in range the nearest one is chosen, not the last',
    notes: [note(1), note(1.08)],
    events: [ev(1.02)],
    expected: [
      ['perfect', 20, null],
      ['miss', null, 'no-input'],
    ],
  },
  {
    name: 'wrong lane is a near miss, not a hit',
    notes: [note(1, { lane: 'a' })],
    events: [ev(1, { lane: 'b' })],
    config: { matchLane: true },
    expected: [['miss', null, 'wrong-lane']],
    strays: 1,
  },
  {
    name: 'right lane hits; the wrong-lane event on another lane is ignored for that note',
    notes: [note(1, { lane: 'a' }), note(1.02, { lane: 'b' })],
    events: [ev(1, { lane: 'b' }), ev(1.02, { lane: 'a' })],
    config: { matchLane: true },
    expected: [
      ['perfect', 20, null],
      ['perfect', -20, null],
    ],
  },
  {
    name: 'lane is not compared when matchLane is off',
    notes: [note(1, { lane: 'a' })],
    events: [ev(1, { lane: 'b' })],
    expected: [['perfect', 0, null]],
  },
  {
    name: 'event without a lane matches a laned note',
    notes: [note(1, { lane: 'a' })],
    events: [ev(1)],
    config: { matchLane: true },
    expected: [['perfect', 0, null]],
  },
  {
    name: 'right pitch within tolerance hits',
    notes: [note(1, { pitch: 60 })],
    events: [ev(1, { pitch: midiToFrequency(60) * 2 ** (30 / 1200) })],
    config: { pitchToleranceCents: 50 },
    expected: [['perfect', 0, null]],
  },
  {
    name: 'wrong pitch is a near miss',
    notes: [note(1, { pitch: 60 })],
    events: [ev(1, { pitch: midiToFrequency(62) })],
    config: { pitchToleranceCents: 50 },
    expected: [['miss', null, 'wrong-pitch']],
    strays: 1,
  },
  {
    name: 'an octave off is wrong unless octave-forgiving',
    notes: [note(1, { pitch: 60 })],
    events: [ev(1, { pitch: midiToFrequency(72) })],
    config: { pitchToleranceCents: 50 },
    expected: [['miss', null, 'wrong-pitch']],
    strays: 1,
  },
  {
    name: 'octave-forgiving accepts the same pitch class in another octave',
    notes: [note(1, { pitch: 60 })],
    events: [ev(1, { pitch: midiToFrequency(72) })],
    config: { pitchToleranceCents: 50, octaveForgiving: true },
    expected: [['perfect', 0, null]],
  },
  {
    name: 'events without a pitch are not pitch-checked',
    notes: [note(1, { pitch: 60 })],
    events: [ev(1)],
    config: { pitchToleranceCents: 50 },
    expected: [['perfect', 0, null]],
  },
  {
    name: 'a hit with the right pitch beats an earlier wrong-pitch candidate',
    notes: [note(1, { pitch: 60 }), note(1.06, { pitch: 64 })],
    events: [ev(1.04, { pitch: midiToFrequency(64) })],
    config: { pitchToleranceCents: 50 },
    expected: [
      ['miss', null, 'no-input'],
      ['perfect', -20, null],
    ],
  },
  {
    name: 'events arriving before any note are strays',
    notes: [note(5)],
    events: [ev(0.5), ev(1)],
    expected: [['miss', null, 'no-input']],
    strays: 2,
  },
];

describe('DiscreteJudge: table-driven', () => {
  it.each(cases)('$name', ({ notes, events, config, expected, strays }) => {
    const judge = new DiscreteJudge(notes, { ...CFG, ...config });
    for (const e of events) judge.feed(e);
    judge.finish();
    const actual = notes.map((_, i) => {
      const j = judge.judgmentFor(i)!;
      return [j.grade, j.timingError === null ? null : Math.round(j.timingError * 1000), j.reason];
    });
    expect(actual).toEqual(expected);
    expect(judge.strays).toBe(strays ?? 0);
  });
});

describe('DiscreteJudge: streaming behaviour', () => {
  it('does not declare a miss until the window plus settle time has passed', () => {
    const judge = new DiscreteJudge([note(1)], { ...CFG, settle: 0.05 });
    expect(judge.advance(1.1)).toEqual([]); // good window still open
    expect(judge.advance(1.149)).toEqual([]); // settle not yet elapsed
    const misses = judge.advance(1.151);
    expect(misses).toHaveLength(1);
    expect(misses[0]!.grade).toBe('miss');
    expect(judge.advance(5)).toEqual([]); // reported once
  });

  it('accounts for the latency offset when expiring notes', () => {
    const judge = new DiscreteJudge([note(1)], { ...CFG, settle: 0, latencyOffset: 0.2 });
    expect(judge.advance(1.25)).toEqual([]); // a late-arriving hit could still be in flight
    expect(judge.advance(1.31)).toHaveLength(1);
  });

  it('a late hit that arrives before expiry still counts', () => {
    const judge = new DiscreteJudge([note(1)], { ...CFG, settle: 0.05, latencyOffset: 0.08 });
    judge.advance(1.12);
    judge.feed(ev(1.08)); // detector delivered the event after the clock moved on
    const out = judge.advance(1.13);
    expect(out).toHaveLength(1);
    expect(out[0]!.grade).toBe('perfect');
  });

  it('returns hits and misses once each, in resolution order', () => {
    const judge = new DiscreteJudge([note(1), note(2), note(3)], CFG);
    judge.feed(ev(1));
    judge.feed(ev(3.02));
    const first = judge.advance(2.5);
    expect(first.map((j) => [j.noteIndex, j.grade])).toEqual([
      [0, 'perfect'],
      [2, 'perfect'],
      [1, 'miss'],
    ]);
    expect(judge.advance(2.6)).toEqual([]);
    expect(judge.judgments).toHaveLength(3);
  });

  it('finish resolves what is left and is idempotent', () => {
    const judge = new DiscreteJudge([note(1), note(2)], CFG);
    judge.feed(ev(1));
    expect(judge.finish().map((j) => j.grade)).toEqual(['perfect', 'miss']);
    expect(judge.finish()).toEqual([]);
  });

  it('good hits earn partial credit', () => {
    const judge = new DiscreteJudge([note(1)], { ...CFG, goodCredit: 0.4 });
    judge.feed(ev(1.08));
    expect(judge.finish()[0]!.credit).toBe(0.4);
  });

  it('records pitch error for pitched hits', () => {
    const judge = new DiscreteJudge([note(1, { pitch: 69 })], { ...CFG, pitchToleranceCents: 100 });
    judge.feed(ev(1, { pitch: 440 * 2 ** (25 / 1200) }));
    expect(judge.finish()[0]!.pitchErrorCents).toBeCloseTo(25, 6);
  });

  it('handles unsorted event arrival (late detector output)', () => {
    const judge = new DiscreteJudge([note(1), note(2)], CFG);
    judge.feed(ev(2.01));
    judge.feed(ev(0.99));
    expect(judge.finish().map((j) => j.grade)).toEqual(['perfect', 'perfect']);
  });
});

describe('DiscreteJudge: jitter robustness (seeded)', () => {
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
    };
  }

  it('any jitter inside the perfect window is perfect, any inside good-but-outside-perfect is good', () => {
    const r = rng(11);
    const notes = Array.from({ length: 200 }, (_, i) => note(1 + i * 0.4));
    const judge = new DiscreteJudge(notes, { ...CFG, latencyOffset: 0.07 });
    const expected: Grade[] = [];
    notes.forEach((n) => {
      const jitter = r() * 0.099;
      judge.feed(ev(n.t + 0.07 + jitter));
      expected.push(Math.abs(jitter) <= 0.05 ? 'perfect' : 'good');
    });
    judge.finish();
    expect(notes.map((_, i) => judge.judgmentFor(i)!.grade)).toEqual(expected);
  });
});

describe('chord matching', () => {
  const chordNote = (t: number, chord: string): ChartNote => ({
    t,
    duration: 0,
    expected: { chord },
  });
  const run = (notes: ChartNote[], events: InputEvent[], config: Partial<DiscreteJudgeConfig>) => {
    const j = new DiscreteJudge(notes, { perfectWindow: 0.05, goodWindow: 0.1, ...config });
    for (const e of events) j.feed(e);
    j.finish(10);
    return j;
  };

  it('a strum of the right chord hits', () => {
    const j = run([chordNote(1, 'C')], [ev(1, { chord: 'C' })], { matchChord: true });
    expect(j.judgmentFor(0)!.grade).toBe('perfect');
  });

  it('a strum of another chord on time misses with the reason, and counts as a stray', () => {
    const j = run([chordNote(1, 'C')], [ev(1, { chord: 'G' })], { matchChord: true });
    expect(j.judgmentFor(0)).toMatchObject({ grade: 'miss', reason: 'wrong-chord' });
    expect(j.strays).toBe(1);
  });

  it('a strum with no recognised chord hits by default, but not when chords are required', () => {
    const lenient = run([chordNote(1, 'C')], [ev(1)], { matchChord: true });
    expect(lenient.judgmentFor(0)!.grade).toBe('perfect');
    const strict = run([chordNote(1, 'C')], [ev(1)], { matchChord: true, requireChord: true });
    expect(strict.judgmentFor(0)).toMatchObject({ grade: 'miss', reason: 'wrong-chord' });
  });

  it('ignores the chord when matching is off, and notes that expect none', () => {
    const off = run([chordNote(1, 'C')], [ev(1, { chord: 'G' })], { matchChord: false });
    expect(off.judgmentFor(0)!.grade).toBe('perfect');
    const free = run([note(1)], [ev(1, { chord: 'G' })], { matchChord: true, requireChord: true });
    expect(free.judgmentFor(0)!.grade).toBe('perfect');
  });

  it('a wrong chord does not use up the note: the right one a moment later still hits', () => {
    const j = run([chordNote(1, 'C')], [ev(0.98, { chord: 'G' }), ev(1.04, { chord: 'C' })], {
      matchChord: true,
    });
    expect(j.judgmentFor(0)!.grade).toBe('perfect');
    expect(j.strays).toBe(1);
  });

  it('the strum profile reads chords by default but never insists on them', () => {
    const c = discreteConfigFromProfile(getProfile('ukulele-strum'), 0);
    expect(c.matchChord).toBe(true);
    expect(c.requireChord).toBe(false);
  });
});

describe('discreteConfigFromProfile', () => {
  it('maps the ukulele strum profile (timing, and the chord when the analyzer names one)', () => {
    expect(discreteConfigFromProfile(getProfile('ukulele-strum'), 0.12)).toEqual({
      perfectWindow: 0.045,
      goodWindow: 0.11,
      latencyOffset: 0.12,
      goodCredit: 0.5,
      matchLane: false,
      requireLane: false,
      matchChord: true,
      requireChord: false,
      pitchToleranceCents: null,
      octaveForgiving: false,
      // chords are recognised from audio that arrives ~0.2 s after the strum
      settle: 0.4,
    });
  });

  it('keeps timing-only profiles quick to resolve and chord-blind', () => {
    expect(discreteConfigFromProfile(getProfile('clap'), 0)).toMatchObject({
      matchChord: false,
      requireChord: false,
      settle: 0.05,
    });
  });

  it('maps strict lane matching and waits longer for classified hits', () => {
    const c = discreteConfigFromProfile(getProfile('hand-percussion'), 0);
    expect(c).toMatchObject({ matchLane: true, requireLane: true, settle: 0.2 });
    expect(discreteConfigFromProfile(getProfile('clap'), 0)).toMatchObject({
      matchLane: false,
      requireLane: false,
    });
  });

  it('maps the ukulele note profile (timing + pitch)', () => {
    const c = discreteConfigFromProfile(getProfile('ukulele-note'), 0);
    expect(c.pitchToleranceCents).toBe(60);
    expect(c.perfectWindow).toBe(0.05);
    expect(c.goodWindow).toBe(0.12);
    expect(c.settle).toBe(0.2); // pitch is attached ~0.14 s after the onset
  });
});

describe('requireLane (classified percussion)', () => {
  const cfg = { ...CFG, matchLane: true, requireLane: true };
  const laned = [note(1, { lane: 'clap' }), note(2, { lane: 'tap' })];

  it('an unclassified ("unknown") event does not hit a laned note', () => {
    const j = new DiscreteJudge(laned, cfg);
    j.feed(ev(1)); // no lane
    j.finish();
    expect(j.judgmentFor(0)!.reason).toBe('wrong-lane');
    expect(j.strays).toBe(1);
  });

  it('without requireLane the same event hits (any-hit behaviour)', () => {
    const j = new DiscreteJudge(laned, { ...CFG, matchLane: true });
    j.feed(ev(1));
    expect(j.judgmentFor(0)!.grade).toBe('perfect');
  });

  it('the right lane hits and the wrong lane is flagged', () => {
    const j = new DiscreteJudge(laned, cfg);
    j.feed(ev(1, { lane: 'clap' }));
    j.feed(ev(2, { lane: 'clap' }));
    j.finish();
    expect(j.judgmentFor(0)!.grade).toBe('perfect');
    expect(j.judgmentFor(1)!.reason).toBe('wrong-lane');
  });

  it('simultaneous notes in two lanes each take their own event', () => {
    const both = [note(1, { lane: 'clap' }), note(1, { lane: 'tap' })];
    const j = new DiscreteJudge(both, cfg);
    j.feed(ev(1.01, { lane: 'tap' }));
    j.feed(ev(1.02, { lane: 'clap' }));
    expect(j.judgmentFor(0)!.timingError).toBeCloseTo(0.02);
    expect(j.judgmentFor(1)!.timingError).toBeCloseTo(0.01);
  });
});
