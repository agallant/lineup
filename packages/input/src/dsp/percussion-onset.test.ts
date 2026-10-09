import {
  addInto,
  blocks,
  clap,
  drumBass,
  drumSlap,
  hihat,
  kick,
  mixAt,
  pinkNoise,
  roomNoise,
  scaleToRmsDb,
  shaker,
  silence,
  slap,
  snare,
  tap,
  whiteNoise,
} from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { OnsetDetector } from './onset';
import { PercussionOnsetDetector } from './percussion-onset';

const SR = 48000;

const sounds = { clap, tap, slap, drumBass, drumSlap, shaker, kick, snare, hihat } as const;
const TIMES = [0.5, 1.2, 1.9, 2.6, 3.3];

function track(
  amp: number,
  fn: (typeof sounds)[keyof typeof sounds],
  noiseDb: number | null = -70,
) {
  const sig = silence(4, SR);
  TIMES.forEach((t, i) => mixAt(sig, fn(SR, { amplitude: amp, seed: i + 1 }), t, SR));
  if (noiseDb !== null) addInto(sig, roomNoise(4, SR, { rmsDb: noiseDb, seed: 9 }));
  return sig;
}

function detect(sig: Float32Array, blockSize = 128, opts = {}) {
  const d = new PercussionOnsetDetector(SR, opts);
  const out = [];
  for (const [b, s] of blocks(sig, blockSize)) out.push(...d.process(b, s));
  return out;
}

describe('PercussionOnsetDetector: every kind of hit, once each', () => {
  it.each(Object.entries(sounds))('%s: exactly one onset per hit, on time', (name, fn) => {
    const onsets = detect(track(0.3, fn));
    expect(onsets).toHaveLength(TIMES.length);
    const tolerance = name === 'shaker' ? 0.004 : 0.002; // the shaker has a soft attack
    onsets.forEach((o, i) => expect(Math.abs(o.frame / SR - TIMES[i]!)).toBeLessThan(tolerance));
  });

  it.each(Object.entries(sounds))(
    '%s: stays single at full volume (no re-triggering on its own tail)',
    (_name, fn) => {
      expect(detect(track(0.8, fn))).toHaveLength(TIMES.length);
    },
  );

  it('REGRESSION: the ukulele onset detector re-triggers on a loud kick tail, which is why percussion has its own', () => {
    const sig = track(0.8, kick);
    const uke = new OnsetDetector(SR);
    const out = [];
    for (const [b, s] of blocks(sig)) out.push(...uke.process(b, s));
    expect(out.length).toBeGreaterThan(TIMES.length + 3);
    expect(detect(sig)).toHaveLength(TIMES.length);
  });
});

describe('PercussionOnsetDetector: rapid hits, flams and double-triggering', () => {
  const twoClaps = (gap: number) => {
    const sig = silence(1.2, SR);
    mixAt(sig, clap(SR, { seed: 1 }), 0.3, SR);
    mixAt(sig, clap(SR, { seed: 2 }), 0.3 + gap, SR);
    return sig;
  };

  it.each([
    [0.03, 1], // well inside the 60 ms refractory period: one hit
    [0.04, 1],
    // 45-65 ms is the grey zone: the second clap may or may not still stand out when the refractory ends
    [0.08, 2],
    [0.1, 2],
    [0.2, 2],
  ])('two claps %d s apart -> %d onset(s)', (gap, expected) => {
    expect(detect(twoClaps(gap))).toHaveLength(expected);
  });

  it('a clap made of 2-4 micro-bursts over up to ~40 ms is one hit, for many different claps', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const sig = silence(0.6, SR);
      mixAt(sig, clap(SR, { seed, variation: 0.3 }), 0.2, SR);
      expect(detect(sig), `clap seed ${seed}`).toHaveLength(1);
    }
  });

  it('a steady 16th-note roll at 140 bpm (107 ms) is counted hit for hit', () => {
    const sig = silence(3, SR);
    const times = Array.from({ length: 16 }, (_, i) => 0.3 + i * 0.107);
    times.forEach((t, i) => mixAt(sig, clap(SR, { seed: i + 1 }), t, SR));
    const onsets = detect(sig);
    expect(onsets).toHaveLength(16);
    onsets.forEach((o, i) => expect(Math.abs(o.frame / SR - times[i]!)).toBeLessThan(0.002));
  });

  it('a configurable refractory period: 0.12 s merges hits 0.1 s apart', () => {
    expect(detect(twoClaps(0.1), 128, { refractory: 0.12 })).toHaveLength(1);
  });
});

describe('PercussionOnsetDetector: noise floor and stream start', () => {
  it.each([0.02, 0.05, 0.1, 0.3])(
    'all hit types are found at amplitude %d in a quiet room (-70 dBFS)',
    (amp) => {
      for (const [name, fn] of Object.entries(sounds))
        expect(detect(track(amp, fn, -70)), name).toHaveLength(TIMES.length);
    },
  );

  it.each([0.05, 0.1, 0.8])(
    'all hit types are found at amplitude %d over -50 dBFS room noise, with no extras',
    (amp) => {
      for (const [name, fn] of Object.entries(sounds))
        expect(detect(track(amp, fn, -50)), name).toHaveLength(TIMES.length);
    },
  );

  it('KNOWN LIMITATION: a hit only ~6 dB above the room noise (peak -34 dBFS over -40 dBFS noise) is mostly lost', () => {
    for (const fn of [clap, slap, snare, hihat, shaker]) {
      expect(detect(track(0.02, fn, -40)).length, fn.name).toBeLessThan(TIMES.length - 2);
    }
  });

  it('never triggers on steady white noise at any level, and ignores the start of the stream', () => {
    for (const db of [-60, -40, -20])
      expect(detect(scaleToRmsDb(whiteNoise(30, SR, 1, 7), db))).toEqual([]);
  });

  it('KNOWN LIMITATION: strongly low-passed (pink / hum) noise gives an occasional stray onset, not a stream of them', () => {
    // stray events cost nothing in scoring (the judge only matches events to notes), but they show in the debug overlay
    expect(detect(pinkNoise(60, SR, -40, 5)).length).toBeLessThan(25);
    expect(detect(roomNoise(60, SR, { rmsDb: -50, seed: 6 })).length).toBeLessThan(25);
  });

  it('a hit inside the 100 ms warm-up is not reported (the reference is still settling)', () => {
    const sig = silence(1, SR);
    mixAt(sig, clap(SR, { seed: 1 }), 0.05, SR);
    mixAt(sig, clap(SR, { seed: 2 }), 0.5, SR);
    const onsets = detect(sig);
    expect(onsets).toHaveLength(1);
    expect(onsets[0]!.frame / SR).toBeCloseTo(0.5, 2);
  });

  it('a louder hit stands out from a ringing tail, a hit well below it does not', () => {
    const loud = silence(1.5, SR);
    mixAt(loud, drumBass(SR, { amplitude: 0.5, seed: 1 }), 0.3, SR);
    mixAt(loud, clap(SR, { amplitude: 0.8, seed: 2 }), 0.5, SR);
    expect(detect(loud)).toHaveLength(2);
    const soft = silence(1.5, SR);
    mixAt(soft, drumBass(SR, { amplitude: 0.5, seed: 1 }), 0.3, SR);
    mixAt(soft, tap(SR, { amplitude: 0.015, seed: 2 }), 0.5, SR);
    expect(detect(soft)).toHaveLength(1);
  });
});

describe('PercussionOnsetDetector: invariants', () => {
  it('is independent of block size', () => {
    const sig = track(0.3, snare);
    const a = detect(sig, 128).map((o) => o.frame);
    expect(detect(sig, 97).map((o) => o.frame)).toEqual(a);
    expect(detect(sig, 4096).map((o) => o.frame)).toEqual(a);
  });

  it('velocity rises with loudness and stays in 0..1', () => {
    const v = [0.05, 0.2, 0.8].map((amp) => {
      const sig = silence(1, SR);
      mixAt(sig, clap(SR, { amplitude: amp, seed: 3 }), 0.4, SR);
      return detect(sig)[0]!.velocity;
    });
    expect(v[0]!).toBeLessThan(v[1]!);
    expect(v[1]!).toBeLessThan(v[2]!);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...v)).toBeLessThanOrEqual(1);
  });

  it('works from any absolute stream position', () => {
    const sig = track(0.3, clap);
    const d = new PercussionOnsetDetector(SR);
    const out = [];
    for (const [b, s] of blocks(sig)) out.push(...d.process(b, 4_800_000 + s));
    expect(out.map((o) => o.frame - 4_800_000)).toEqual(detect(sig).map((o) => o.frame));
  });
});
