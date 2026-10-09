import { describe, expect, it } from 'vitest';
import type { ChartNote } from '../chart';
import { getProfile } from '../profiles';
import { midiToFrequency } from '../notes';
import type { PitchFrame } from '../types';
import {
  ContinuousJudge,
  continuousConfigFromProfile,
  type ContinuousJudgeConfig,
} from './continuous';
import type { Grade, MissReason } from './types';

const HOP = 256 / 48000;
const C4 = midiToFrequency(60);
const cents = (hz: number, c: number) => hz * 2 ** (c / 1200);

/** Frames every HOP from `from` to `to`, produced by `at(t)` (Hz, or null for unvoiced). */
function frames(
  from: number,
  to: number,
  at: (t: number) => number | null,
  extra: Partial<PitchFrame> = {},
): PitchFrame[] {
  const out: PitchFrame[] = [];
  for (let t = from; t < to; t += HOP) {
    const hz = at(t);
    out.push({
      time: t,
      frequency: hz,
      clarity: hz === null ? 0.2 : 0.97,
      level: hz === null ? -90 : -25,
      ...extra,
    });
  }
  return out;
}

const note = (t: number, duration: number, pitch = 60): ChartNote => ({ t, duration, pitch });

function judgeOne(n: ChartNote, fs: PitchFrame[], config: Partial<ContinuousJudgeConfig> = {}) {
  const j = new ContinuousJudge([n], { frameInterval: HOP, ...config });
  for (const f of fs) j.feed(f);
  j.finish();
  return j.judgmentFor(0)!;
}

interface Case {
  name: string;
  /** frames for a note at t=1, duration 1 */
  at: (t: number) => number | null;
  config?: Partial<ContinuousJudgeConfig>;
  extra?: Partial<PitchFrame>;
  grade: Grade;
  reason?: MissReason;
  coverage?: [number, number];
  entry?: [number, number];
}

const cases: Case[] = [
  {
    name: 'steady on-pitch for the whole note',
    at: () => C4,
    grade: 'perfect',
    coverage: [0.97, 1],
    entry: [0, 0.02],
  },
  {
    name: 'right pitch only in the second half',
    at: (t) => (t >= 1.5 ? C4 : null),
    grade: 'good',
    coverage: [0.45, 0.55],
    entry: [0.49, 0.53],
  },
  {
    name: 'right pitch only in the first 30%',
    at: (t) => (t < 1.3 ? C4 : null),
    grade: 'miss',
    reason: 'wrong-pitch',
    coverage: [0.25, 0.35],
  },
  {
    name: 'entering 0.25 s late (coverage .75 but late entry) is only good',
    at: (t) => (t >= 1.25 ? C4 : null),
    grade: 'good',
    coverage: [0.72, 0.78],
    entry: [0.24, 0.27],
  },
  {
    name: 'entering 0.1 s late is still perfect',
    at: (t) => (t >= 1.1 ? C4 : null),
    grade: 'perfect',
    coverage: [0.87, 0.92],
    entry: [0.09, 0.12],
  },
  {
    name: 'singing early (0.3 s before) and holding is on time',
    at: (t) => (t >= 0.7 ? C4 : null),
    grade: 'perfect',
    coverage: [0.97, 1],
    entry: [0, 0.02],
  },
  { name: '40 cents flat is within tolerance', at: () => cents(C4, -40), grade: 'perfect' },
  { name: '55 cents sharp is within tolerance', at: () => cents(C4, 55), grade: 'perfect' },
  {
    name: '80 cents flat is out of tolerance',
    at: () => cents(C4, -80),
    grade: 'miss',
    reason: 'wrong-pitch',
    coverage: [0, 0.05],
  },
  {
    name: 'a semitone sharp is wrong',
    at: () => midiToFrequency(61),
    grade: 'miss',
    reason: 'wrong-pitch',
  },
  { name: 'an octave low is accepted (octave-forgiving)', at: () => C4 / 2, grade: 'perfect' },
  { name: 'an octave high is accepted (octave-forgiving)', at: () => C4 * 2, grade: 'perfect' },
  {
    name: 'an octave low is wrong when not octave-forgiving',
    at: () => C4 / 2,
    config: { octaveForgiving: false },
    grade: 'miss',
    reason: 'wrong-pitch',
  },
  {
    name: 'a different pitch class an octave low is still wrong',
    at: () => midiToFrequency(50),
    grade: 'miss',
    reason: 'wrong-pitch',
  },
  {
    name: '120-cent vibrato at 5.5 Hz is smoothed away',
    at: (t) => cents(C4, 120 * Math.sin(2 * Math.PI * 5.5 * t)),
    grade: 'perfect',
  },
  {
    name: '100-cent vibrato without smoothing is only on pitch ~41% of the time',
    at: (t) => cents(C4, 100 * Math.sin(2 * Math.PI * 5.5 * t)),
    config: { vibratoSmoothing: 0 },
    grade: 'good',
    coverage: [0.36, 0.46],
  },
  {
    name: 'a 70 ms scoop up from 100 cents flat',
    at: (t) => cents(C4, t - 1 < 0.07 ? -100 * (1 - (t - 1) / 0.07) : 0),
    grade: 'perfect',
    coverage: [0.88, 1],
  },
  {
    name: 'a 50 ms unvoiced gap (consonant/breath) barely matters',
    at: (t) => (t >= 1.4 && t < 1.45 ? null : C4),
    grade: 'perfect',
    coverage: [0.9, 1],
  },
  {
    name: 'silence is a no-input miss',
    at: () => null,
    grade: 'miss',
    reason: 'no-input',
    coverage: [0, 0],
  },
  {
    name: 'low-clarity frames at the right pitch are ignored',
    at: () => C4,
    extra: { clarity: 0.5 },
    grade: 'miss',
    reason: 'no-input',
  },
  {
    name: 'too-quiet frames at the right pitch are ignored',
    at: () => C4,
    extra: { level: -70 },
    grade: 'miss',
    reason: 'no-input',
  },
];

describe('ContinuousJudge: table-driven (note at t=1, 1 s long)', () => {
  it.each(cases)('$name', ({ at, config, extra, grade, reason, coverage, entry }) => {
    const j = judgeOne(note(1, 1), frames(0, 3, at, extra), config);
    expect(j.grade).toBe(grade);
    if (reason !== undefined) expect(j.reason).toBe(reason);
    else if (grade !== 'miss') expect(j.reason).toBeNull();
    if (coverage) {
      expect(j.coverage).toBeGreaterThanOrEqual(coverage[0]);
      expect(j.coverage).toBeLessThanOrEqual(coverage[1]);
    }
    if (entry) {
      expect(j.timingError).toBeGreaterThanOrEqual(entry[0]);
      expect(j.timingError).toBeLessThanOrEqual(entry[1]);
    }
    expect(j.credit).toBe(grade === 'miss' ? 0 : j.coverage);
  });
});

describe('ContinuousJudge: latency, sequences and streaming', () => {
  it('latency offset aligns delayed frames: 0.2 s late singer is perfect once calibrated', () => {
    const late = frames(0, 3, (t) => (t >= 1.2 && t < 2.2 ? C4 : null));
    expect(judgeOne(note(1, 1), late, { latencyOffset: 0.2 }).grade).toBe('perfect');
    const uncalibrated = judgeOne(note(1, 1), late, { latencyOffset: 0 });
    expect(uncalibrated.grade).toBe('good');
    expect(uncalibrated.coverage!).toBeGreaterThan(0.75);
    expect(uncalibrated.coverage!).toBeLessThan(0.85);
  });

  it('judges each note on its own frames (a missed note does not hurt its neighbours)', () => {
    const notes = [note(1, 0.8, 60), note(2, 0.8, 64), note(3, 0.8, 67)];
    const j = new ContinuousJudge(notes, { frameInterval: HOP });
    const f = frames(0, 4.5, (t) =>
      t < 1.8 ? C4 : t >= 3 && t < 3.8 ? midiToFrequency(67) : null,
    );
    f.forEach((x) => j.feed(x));
    j.finish();
    expect(notes.map((_, i) => j.judgmentFor(i)!.grade)).toEqual(['perfect', 'miss', 'perfect']);
    expect(j.judgmentFor(1)!.reason).toBe('no-input');
  });

  it('a held pitch spanning two same-pitch notes counts as on time for the second', () => {
    const notes = [note(1, 1, 60), note(2, 1, 60)];
    const j = new ContinuousJudge(notes, { frameInterval: HOP });
    frames(0, 3.5, (t) => (t >= 1 && t < 3 ? C4 : null)).forEach((x) => j.feed(x));
    j.finish();
    expect(j.judgmentFor(1)!.grade).toBe('perfect');
    expect(j.judgmentFor(1)!.timingError).toBe(0);
  });

  it('does not resolve a note until it has ended plus the settle time', () => {
    const j = new ContinuousJudge([note(1, 1)], { frameInterval: HOP, settle: 0.15 });
    frames(0, 2.2, () => C4).forEach((x) => j.feed(x));
    expect(j.advance(2.1)).toEqual([]);
    expect(j.advance(2.149)).toEqual([]);
    const out = j.advance(2.151);
    expect(out).toHaveLength(1);
    expect(out[0]!.grade).toBe('perfect');
    expect(j.advance(9)).toEqual([]);
  });

  it('settle time accounts for the latency offset', () => {
    const j = new ContinuousJudge([note(1, 1)], {
      frameInterval: HOP,
      settle: 0.1,
      latencyOffset: 0.2,
    });
    frames(0, 3, (t) => (t >= 1.2 ? C4 : null)).forEach((x) => j.feed(x));
    expect(j.advance(2.25)).toEqual([]);
    expect(j.advance(2.31)).toHaveLength(1);
  });

  it('notes shorter than the minimum are judged as if minNoteDuration long', () => {
    const j = judgeOne(
      note(1, 0.02),
      frames(0, 2, (t) => (t >= 1 && t < 1.2 ? C4 : null)),
      { minNoteDuration: 0.2 },
    );
    expect(j.grade).toBe('perfect');
  });

  it('entry needs two consecutive on-pitch frames: a single-frame blip is ignored, two count', () => {
    const blip = (n: number) =>
      frames(0, 3, (t) => {
        const k = Math.round((t - 1) / HOP);
        if (k >= 0 && k < n) return C4; // n on-pitch frames right at the start
        return t >= 1.4 ? C4 : null; // proper entry 0.4 s later
      });
    const one = judgeOne(note(1, 1), blip(1));
    expect(one.timingError!).toBeGreaterThan(0.38); // the 1-frame blip did not count as entry
    const two = judgeOne(note(1, 1), blip(2));
    expect(two.timingError!).toBeLessThan(0.02); // two frames did
  });

  it('a few garbage frames at random pitches do not drag a good note down (median, not mean)', () => {
    const noisy = frames(0, 3, (t) => {
      const k = Math.round(t / HOP);
      return k % 5 === 0 ? C4 * 1.9 : C4; // every 5th frame is far off
    });
    const j = judgeOne(note(1, 1), noisy);
    expect(j.grade).toBe('perfect');
    expect(j.coverage!).toBeGreaterThan(0.75);
  });

  it('a chart note without a pitch cannot be sung: miss, no-input', () => {
    const j = judgeOne(
      { t: 1, duration: 1 },
      frames(0, 3, () => C4),
    );
    expect(j.grade).toBe('miss');
    expect(j.reason).toBe('no-input');
  });

  it('reports the mean pitch error in cents (smoothed), signed', () => {
    const j = judgeOne(
      note(1, 1),
      frames(0, 3, () => cents(C4, 35)),
    );
    expect(j.pitchErrorCents!).toBeGreaterThan(30);
    expect(j.pitchErrorCents!).toBeLessThan(40);
    const flat = judgeOne(
      note(1, 1),
      frames(0, 3, () => cents(C4, -35)),
    );
    expect(flat.pitchErrorCents!).toBeLessThan(-30);
  });

  it('coverage is normalised by the configured frame interval', () => {
    // frames arrive twice as fast as configured: coverage clamps to 1 rather than exceeding it
    const fast: PitchFrame[] = [];
    for (let t = 0; t < 3; t += HOP / 2)
      fast.push({ time: t, frequency: C4, clarity: 0.97, level: -25 });
    expect(judgeOne(note(1, 1), fast, { frameInterval: HOP }).coverage).toBe(1);
  });

  it('prunes old frames as notes resolve (bounded memory)', () => {
    const notes = Array.from({ length: 40 }, (_, i) => note(1 + i, 0.8, 60));
    const j = new ContinuousJudge(notes, { frameInterval: HOP });
    let t = 0;
    for (let i = 0; i < 40 * 190; i++) {
      j.feed({ time: t, frequency: C4, clarity: 0.97, level: -25 });
      t += HOP;
      if (i % 50 === 0) j.advance(t);
    }
    j.advance(t + 5);
    // @ts-expect-error reaching in to check pruning
    expect(j.frames.length).toBeLessThan(400);
    expect(j.judgments).toHaveLength(40);
  });
});

describe('ContinuousJudge.peek (live feedback)', () => {
  it('tracks coverage so far and whether the singer is on pitch right now', () => {
    const j = new ContinuousJudge([note(1, 2)], { frameInterval: HOP });
    frames(0, 2, (t) => (t >= 1.2 ? C4 : null)).forEach((x) => j.feed(x));
    const mid = j.peek(0, 2);
    expect(mid.onPitchNow).toBe(true);
    expect(mid.coverage).toBeGreaterThan(0.7); // 0.8 s of the first 1 s so far
    expect(mid.coverage).toBeLessThan(0.9);
    const early = new ContinuousJudge([note(1, 2)], { frameInterval: HOP });
    frames(0, 1.5, () => null).forEach((x) => early.feed(x));
    expect(early.peek(0, 1.5)).toMatchObject({ onPitchNow: false, coverage: 0, voiced: false });
  });

  it('is not on pitch when the last frame is stale', () => {
    const j = new ContinuousJudge([note(1, 2)], { frameInterval: HOP });
    frames(0, 1.5, () => C4).forEach((x) => j.feed(x));
    expect(j.peek(0, 1.45).onPitchNow).toBe(true);
    expect(j.peek(0, 2.5).onPitchNow).toBe(false); // nothing for a second: not "now"
  });
});

describe('continuousConfigFromProfile', () => {
  it('maps the voice profile', () => {
    const c = continuousConfigFromProfile(getProfile('voice'), 0.09, 256 / 48000);
    expect(c).toMatchObject({
      latencyOffset: 0.09,
      perfectWindow: 0.18,
      goodWindow: 0.4,
      toleranceCents: 60,
      octaveForgiving: true,
      vibratoSmoothing: 0.18,
      coverageGood: 0.35,
      coveragePerfect: 0.75,
      minClarity: 0.55,
      minLevelDb: -55,
    });
    expect(c.frameInterval).toBeCloseTo(0.005333, 6);
  });

  it('refuses a profile without pitch settings', () => {
    expect(() => continuousConfigFromProfile(getProfile('ukulele-strum'), 0, 0.005)).toThrow(
      /no judgment.pitch/,
    );
  });
});
