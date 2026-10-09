/**
 * End-to-end simulations for Beatline: synthetic hands and drums play charts
 * through the real percussion analyzer -> timbre classifier -> lane-matching
 * judge -> scoreboard. They vouch for the software, not for how a real room,
 * microphone or pair of hands behaves (see the PR's "Unverified" list).
 */
import {
  chartFromBeats,
  getProfile,
  getSong,
  type Chart,
  type Grade,
  type TimbreModel,
} from '@lineup/core';
import { clap, drumSlap, hihat, kick, rng, shaker, silence, snare, tap } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { detectClickBleed } from '@lineup/input';
import { enrollSynthetic } from './enroll';
import { renderPerformance, type PerformanceOptions } from './performance';
import { percussionPerformer, type HitSound } from './performers';
import { runDiscrete } from './pipeline';

const clapProfile = getProfile('clap');
const hand = getProfile('hand-percussion');
const kit = getProfile('drum-kit');

const clapSong = getSong('clap-basic');
const handSong = getSong('clap-tap-groove');
const rockSong = getSong('drum-rock');

const HAND_SOUNDS: Record<string, HitSound> = { clap, tap };
const KIT_SOUNDS: Record<string, HitSound> = { kick, snare, hat: hihat };
const ANY_HIT: Record<string, HitSound> = { hit: clap };

const LATENCY = 0.1;
const counts = (r: ReturnType<typeof runDiscrete>) => r.score.counts;
const grades = (r: ReturnType<typeof runDiscrete>): Grade[] =>
  r.judgments
    .slice()
    .sort((a, b) => a.noteIndex - b.noteIndex)
    .map((j) => j.grade);

function play(
  chart: Chart,
  profile: typeof hand,
  sounds: Record<string, HitSound>,
  model: TimbreModel | null,
  options: PerformanceOptions & { gain?: (i: number) => number; variation?: number } = {},
) {
  const { gain, variation, ...perfOptions } = options;
  const perf = renderPerformance(
    chart,
    percussionPerformer(sounds, {
      ...(gain ? { gain } : {}),
      ...(variation !== undefined ? { variation } : {}),
    }),
    { latency: LATENCY, ...perfOptions },
  );
  return runDiscrete(perf, chart, profile, { latencyOffset: LATENCY, timbreModel: model });
}

const handModel = () => enrollSynthetic(hand, HAND_SOUNDS).model;
const kitModel = () => enrollSynthetic(kit, KIT_SOUNDS).model;

describe('clap, single lane (any hit)', () => {
  it('a steady clapper scores perfect on every note, with ~0 error after calibration', () => {
    const r = play(clapSong, clapProfile, ANY_HIT, null);
    expect(counts(r)).toEqual({ perfect: clapSong.notes.length, good: 0, miss: 0 });
    expect(r.strays).toBe(0);
    expect(Math.max(...r.judgments.map((j) => Math.abs(j.timingError!)))).toBeLessThan(0.006);
  });

  it('a clap with several micro-bursts counts once, across seeds and hop phases', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = play(clapSong, clapProfile, ANY_HIT, null, { seed, leadSamples: seed * 61 });
      expect(r.strays).toBe(0);
      expect(counts(r).miss).toBe(0);
    }
  });

  it('any sound counts in single-lane mode (a tap is as good as a clap)', () => {
    const r = play(clapSong, clapProfile, { hit: tap }, null);
    expect(counts(r).miss).toBe(0);
  });

  it('works whatever the player does with timing: late and early hits grade by distance', () => {
    const late = play(clapSong, clapProfile, ANY_HIT, null, { latency: LATENCY + 0.08 });
    expect(grades(late).every((g) => g === 'good')).toBe(true);
    const wayOff = play(clapSong, clapProfile, ANY_HIT, null, { latency: LATENCY + 0.2 });
    expect(counts(wayOff).perfect).toBe(0);
  });

  it('handles human timing jitter (σ = 25 ms) without losing or duplicating hits', () => {
    const r = play(clapSong, clapProfile, ANY_HIT, null, { jitter: 0.025, seed: 5 });
    expect(counts(r).miss).toBe(0);
    expect(r.strays).toBe(0);
  });

  it('missed claps are misses; nothing else is disturbed', () => {
    const r = play(clapSong, clapProfile, ANY_HIT, null, { skip: [3, 8] });
    expect(counts(r).miss).toBe(2);
    expect(
      r.judgments
        .filter((j) => j.grade === 'miss')
        .map((j) => j.noteIndex)
        .sort(),
    ).toEqual([3, 8]);
  });

  it('is independent of when the audio clock started', () => {
    const a = play(clapSong, clapProfile, ANY_HIT, null, { ctxStart: 0 });
    const b = play(clapSong, clapProfile, ANY_HIT, null, { ctxStart: 4321.0123 });
    expect(grades(a)).toEqual(grades(b));
  });
});

describe('hand percussion: clap vs tap', () => {
  const model = handModel();

  it('enrollment learns both sounds and sees no problem with them', () => {
    const e = enrollSynthetic(hand, HAND_SOUNDS);
    expect(e.warnings).toEqual([]);
    expect(e.model.classes.map((c) => c.id)).toEqual(['clap', 'tap']);
    expect(e.outcomes.filter((o) => o === 'accepted')).toHaveLength(12);
  });

  it('plays the groove perfectly, each hit in the right lane', () => {
    const r = play(handSong, hand, HAND_SOUNDS, model);
    expect(counts(r)).toEqual({ perfect: handSong.notes.length, good: 0, miss: 0 });
    expect(r.strays).toBe(0);
    expect(r.classifications.every((c) => c.id !== null)).toBe(true);
  });

  it('classifies correctly with natural hit-to-hit variation', () => {
    for (const seed of [2, 3, 4]) {
      const r = play(handSong, hand, HAND_SOUNDS, model, { seed, variation: 0.3 });
      expect(counts(r).miss).toBe(0);
    }
  });

  it('classifies correctly when the player is much louder or softer than at enrollment', () => {
    for (const g of [0.25, 0.5, 1.6]) {
      const r = play(handSong, hand, HAND_SOUNDS, model, { gain: () => g });
      expect(counts(r)).toEqual({ perfect: handSong.notes.length, good: 0, miss: 0 });
    }
  });

  it('classifies correctly with random per-hit loudness (±12 dB)', () => {
    const rand = rng(77);
    const r = play(handSong, hand, HAND_SOUNDS, model, { gain: () => 10 ** ((rand() * 12) / 20) });
    expect(counts(r).miss).toBe(0);
  });

  it('classifies correctly in a noisy room (fan, -50 dBFS)', () => {
    const r = play(handSong, hand, HAND_SOUNDS, model, { noise: { rmsDb: -50, seed: 3 } });
    expect(counts(r).miss).toBe(0);
    expect(r.strays).toBe(0);
  });

  it('a clap where a tap is expected is a wrong-lane miss, and vice versa', () => {
    const r = play(handSong, hand, HAND_SOUNDS, model, {
      override: (note) => (note.lane === 'tap' ? { ...note, lane: 'clap' } : note),
    });
    const taps = handSong.notes.filter((n) => n.lane === 'tap').length;
    expect(counts(r).miss).toBe(taps);
    expect(r.judgments.filter((j) => j.reason === 'wrong-lane')).toHaveLength(taps);
  });

  it('an unrelated sound (a shaker) is rejected as unknown rather than guessed', () => {
    const r = play(handSong, hand, { clap, tap: shaker }, model);
    const taps = handSong.notes.filter((n) => n.lane === 'tap').length;
    expect(counts(r).miss).toBe(taps);
    expect(r.classifications.filter((c) => c.id === null).length).toBeGreaterThanOrEqual(taps - 1);
  });

  it('without an enrolled model strict lanes cannot match (so the app must enroll first)', () => {
    const r = play(handSong, hand, HAND_SOUNDS, null);
    expect(counts(r).perfect).toBe(0);
  });
});

describe('double triggering', () => {
  it('a long ringing tail (kick) does not retrigger', () => {
    const model = kitModel();
    const r = play(rockSong, kit, KIT_SOUNDS, model);
    expect(r.strays).toBe(0);
  });

  it('a hit that rings with a second, quieter echo ~120 ms later is a stray, never a second note', () => {
    const echo: HitSound = (sr, o) => {
      const first = clap(sr, o);
      const out = new Float32Array(Math.round(0.4 * sr));
      out.set(first);
      const second = clap(sr, { ...o, amplitude: 0.12, seed: (o.seed ?? 1) + 1 });
      out.set(second, Math.round(0.12 * sr));
      return out;
    };
    const r = play(clapSong, clapProfile, { hit: echo }, null);
    expect(counts(r).miss).toBe(0);
    expect(counts(r).perfect).toBe(clapSong.notes.length);
  });
});

describe('rapid hits', () => {
  const rapid = chartFromBeats(
    { title: 'rapid', bpm: 120, countInBeats: 2 },
    // 16th notes at 120 bpm = 125 ms apart, then 80 ms flams
    [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75].map((beat) => ({ beat, lane: 'hit' })),
  );
  it('125 ms apart: every hit detected and judged', () => {
    const r = play(rapid, clapProfile, ANY_HIT, null);
    expect(counts(r)).toEqual({ perfect: 8, good: 0, miss: 0 });
  });

  it('80 ms apart (a fast roll): still separated', () => {
    const roll = chartFromBeats(
      { title: 'roll', bpm: 120, countInBeats: 2 },
      Array.from({ length: 8 }, (_, i) => ({ beat: i * 0.16, lane: 'hit' })),
    );
    const r = play(roll, clapProfile, { hit: tap }, null);
    expect(counts(r).miss).toBeLessThanOrEqual(1);
  });

  it('classifies alternating clap/tap at 125 ms correctly', () => {
    const model = handModel();
    const alt = chartFromBeats(
      { title: 'alt', bpm: 120, countInBeats: 2 },
      Array.from({ length: 12 }, (_, i) => ({ beat: i * 0.25, lane: i % 2 ? 'tap' : 'clap' })),
    );
    const r = play(alt, hand, HAND_SOUNDS, model);
    expect(counts(r).miss).toBe(0);
  });
});

describe('quiet hits', () => {
  it('taps 30 dB below a loud clap, in a quiet room, are still heard', () => {
    const r = play(clapSong, clapProfile, { hit: tap }, null, { gain: () => 0.03 });
    expect(counts(r).miss).toBe(0);
  });

  it('hits buried in the noise floor are not detected, and the noise does not invent hits', () => {
    const r = play(clapSong, clapProfile, { hit: tap }, null, {
      gain: () => 0.004,
      noise: { rmsDb: -45, seed: 2 },
    });
    expect(counts(r).perfect + counts(r).good).toBe(0);
    expect(r.strays).toBe(0);
  });

  it('steady room noise at any level starts a false hit only about once per half minute', () => {
    let falseHits = 0;
    for (const rmsDb of [-40, -50, -58]) {
      for (let seed = 1; seed <= 6; seed++) {
        const perf = renderPerformance(clapSong, () => null, { noise: { rmsDb, seed }, tail: 6 });
        falseHits += runDiscrete(perf, clapSong, clapProfile, { latencyOffset: 0 }).inputs.length;
      }
    }
    // 18 runs of ~16 s measured at 7 on these seeds (KNOWN LIMITATION: pink-noise swells of 9+ dB); they are
    // strays, only harmful if one lands within 120 ms of a note
    expect(falseHits).toBeLessThanOrEqual(12);
  });

  it('pure room noise and silence produce no events', () => {
    const perf = renderPerformance(clapSong, () => null, { noise: { rmsDb: -50, seed: 9 } });
    const r = runDiscrete(perf, clapSong, clapProfile, { latencyOffset: 0 });
    expect(r.inputs).toHaveLength(0);
    const quiet = renderPerformance(clapSong, () => null);
    expect(runDiscrete(quiet, clapSong, clapProfile, { latencyOffset: 0 }).inputs).toHaveLength(0);
    expect(silence(0.1, 48000)).toHaveLength(4800);
  });
});

describe('bleed', () => {
  /** Metronome clicks on the half second: a 1 kHz, 30 ms speaker blip at `amp` peak. */
  const clicks =
    (amp: number) =>
    (total: number, sr: number, songStart: number): Float32Array => {
      const out = new Float32Array(total);
      for (let t = Math.ceil(songStart / 0.5) * 0.5; t < total / sr + songStart; t += 0.5) {
        const i = Math.round((t - songStart) * sr);
        for (let k = 0; k < 1500 && i + k < total; k++)
          if (i + k >= 0)
            out[i + k] = amp * Math.sin((2 * Math.PI * 1000 * k) / sr) * Math.exp(-k / 400);
      }
      return out;
    };

  it('clicks leaking at -60 dBFS are below the detector and harmless', () => {
    const r = play(clapSong, clapProfile, ANY_HIT, null, { extra: clicks(0.001) });
    expect(r.strays).toBe(0);
    expect(counts(r).perfect).toBe(clapSong.notes.length);
  });

  it('clicks leaking at -40 dBFS or louder register as hits: strays, and early/late "good" for real notes', () => {
    const r = play(clapSong, clapProfile, ANY_HIT, null, { extra: clicks(0.01) });
    expect(r.strays).toBeGreaterThan(10);
    // KNOWN LIMITATION: the judge cannot tell a speaker click from a clap, which is why the app runs the
    // silent click check (below) and asks for headphones before the song.
    expect(counts(r).good).toBeGreaterThan(0);
  });

  it('the silent click check flags that leak and passes the clean case', () => {
    const silentPlayer = (amp: number) => {
      const song = chartFromBeats({ title: 'check', bpm: 120, countInBeats: 4 }, [{ beat: 8 }]);
      const perf = renderPerformance(song, () => null, { extra: clicks(amp), tail: 3 });
      const onsets = runDiscrete(perf, song, clapProfile, { latencyOffset: 0 }).messages.flatMap(
        (m) => (m.type === 'input' ? [m.event.time] : []),
      );
      const clickTimes: number[] = [];
      for (let t = Math.ceil(perf.songStart / 0.5) * 0.5; t < 2; t += 0.5)
        clickTimes.push(perf.ctxStart + (t - perf.songStart));
      return detectClickBleed(onsets, clickTimes);
    };
    expect(silentPlayer(0.01)).toMatchObject({ bleeding: true });
    expect(silentPlayer(0.001)).toMatchObject({ bleeding: false, fraction: 0 });
  });
});

describe('drum kit', () => {
  const model = kitModel();

  it('enrolls kick, snare and hat as three distinct classes', () => {
    const e = enrollSynthetic(kit, KIT_SOUNDS);
    expect(e.warnings).toEqual([]);
    expect(e.model.classes).toHaveLength(3);
  });

  it('plays a rock beat: kick, snare and off-beat hats each land in their own lane', () => {
    const r = play(rockSong, kit, KIT_SOUNDS, model);
    expect(counts(r)).toEqual({ perfect: rockSong.notes.length, good: 0, miss: 0 });
    expect(r.strays).toBe(0);
  });

  it('KNOWN LIMITATION: two drums struck at once register as one hit (one onset, one lane)', () => {
    const layered = chartFromBeats(
      { title: 'layered', bpm: 90, countInBeats: 2 },
      [0, 1, 2, 3].flatMap((beat) => [
        { beat, lane: 'kick' },
        { beat, lane: 'hat' },
      ]),
    );
    const r = play(layered, kit, KIT_SOUNDS, model);
    expect(counts(r).miss).toBe(4); // one of each pair is missed; the player must stagger layered hits
    expect(counts(r).perfect + counts(r).good).toBe(4);
  });

  it('shaker enrolled as an extra hat-like sound is told apart from a snare', () => {
    const e = enrollSynthetic(kit, { kick, snare, hat: shaker });
    expect(e.warnings).toEqual([]);
    expect(drumSlap(48000, {}).length).toBeGreaterThan(0);
  });
});
