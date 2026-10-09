/**
 * Deterministic synthetic scenarios and the summaries recorded for them.
 * Shared by characterization.test.ts (compare) and its UPDATE_GOLDEN mode
 * (re-record). Do not change a scenario without re-recording and calling it
 * out in the PR.
 */
import { InputAnalyzer } from './audio/dsp/analyzer';
import { OnsetDetector } from './audio/dsp/onset';
import { PitchTracker } from './audio/dsp/pitch';
import { midiToFrequency, nearestOpenString, noteFromFrequency } from './audio/notes';
import { blocks, karplusStrong, mixAt, pluck, silence, sine, whiteNoise } from './test-utils/synth';

export const SR = 48000;
const GCEA_MIDI = [67, 60, 64, 69];
const round = (v: number, digits: number) => Number(v.toFixed(digits));

function trackPitch(sig: Float32Array) {
  const tracker = new PitchTracker(SR);
  const est = [];
  for (const [b, s] of blocks(sig)) est.push(...tracker.process(b, s));
  return est;
}

function detectOnsets(sig: Float32Array) {
  const d = new OnsetDetector(SR);
  const out = [];
  for (const [b, s] of blocks(sig)) out.push(...d.process(b, s));
  return out.map((x) => [x.frame, round(x.velocity, 3), round(x.db, 2)]);
}

// ---- pitch: the four open strings, two signal models --------------------

function pitchStrings() {
  const out: unknown[] = [];
  for (const midi of GCEA_MIDI) {
    const hz = midiToFrequency(midi);
    const signals = [
      ['pluck', pluck(hz, 1, SR)],
      ['ks', karplusStrong(hz, 1, SR)],
    ] as const;
    for (const [kind, sig] of signals) {
      const est = trackPitch(sig);
      const voiced = est.filter((e) => e.hz !== null);
      const hzs = voiced.map((e) => e.hz!).sort((a, b) => a - b);
      const clarity = est.map((e) => e.clarity);
      out.push({
        midi,
        kind,
        count: est.length,
        voiced: voiced.length,
        firstVoicedCenter: voiced[0]?.centerFrame,
        medianHz: round(hzs[Math.floor(hzs.length / 2)]!, 3),
        minClarity: round(Math.min(...clarity), 3),
        maxClarity: round(Math.max(...clarity), 3),
        lastCenter: est.at(-1)!.centerFrame,
      });
    }
  }
  return out;
}

// ---- pitch: scenarios that sit close to the clarity / level gates -------

function noisySine(noiseAmp: number): Float32Array {
  const sig = sine(261.626, 0.5, SR, 0.3);
  const noise = whiteNoise(0.5, SR, noiseAmp, 3);
  for (let i = 0; i < sig.length; i++) sig[i]! += noise[i]!;
  return sig;
}

const levelSine = (db: number) => sine(261.626, 0.4, SR, 10 ** (db / 20) * Math.SQRT2);

const pitchBoundaryScenarios: Record<string, () => Float32Array> = {
  clarity0_93: () => noisySine(0.1),
  clarity0_86: () => noisySine(0.15),
  level_minus58dB: () => levelSine(-58),
  level_minus62dB: () => levelSine(-62),
};

function pitchBoundaries() {
  const out: Record<string, unknown> = {};
  for (const [name, make] of Object.entries(pitchBoundaryScenarios)) {
    const est = trackPitch(make());
    const clarity = est.map((e) => e.clarity).sort((a, b) => a - b);
    out[name] = {
      count: est.length,
      voiced: est.filter((e) => e.hz !== null).length,
      medianClarity: round(clarity[Math.floor(clarity.length / 2)]!, 3),
    };
  }
  return out;
}

// ---- onsets -------------------------------------------------------------

const ringingC4Then = (amp: number): Float32Array => {
  const sig = silence(1.5, SR);
  mixAt(sig, karplusStrong(261.626, 1.4, SR, { amplitude: 0.5 }), 0.1, SR);
  mixAt(sig, karplusStrong(329.628, 0.6, SR, { amplitude: amp, seed: 5 }), 0.8, SR);
  return sig;
};

const twoPlucksGap = (gap: number): Float32Array => {
  const sig = silence(1, SR);
  mixAt(sig, karplusStrong(261.626, 0.5, SR, { seed: 1 }), 0.1, SR);
  mixAt(sig, karplusStrong(329.628, 0.5, SR, { seed: 2 }), 0.1 + gap, SR);
  return sig;
};

const onsetScenarios: Record<string, () => Float32Array> = {
  fourStrings: () => {
    const sig = silence(2.5, SR);
    GCEA_MIDI.forEach((m, i) =>
      mixAt(sig, pluck(midiToFrequency(m), 0.8, SR), [0.2, 0.7, 1.2, 1.7][i]!, SR),
    );
    return sig;
  },
  replucks: () => {
    const sig = silence(2, SR);
    [0.1, 0.4, 0.65, 0.9, 1.15].forEach((t, i) =>
      mixAt(sig, karplusStrong(midiToFrequency(60), 1.5, SR, { seed: i + 1 }), t, SR),
    );
    return sig;
  },
  strum: () => {
    const sig = silence(1, SR);
    GCEA_MIDI.forEach((m, i) =>
      mixAt(
        sig,
        karplusStrong(midiToFrequency(m), 0.8, SR, { seed: i + 3, amplitude: 0.25 }),
        0.3 + i * 0.008,
        SR,
      ),
    );
    return sig;
  },
  sixteenths: () => {
    const sig = silence(1.5, SR);
    Array.from({ length: 8 }, (_, i) => 0.1 + i * 0.125).forEach((t, i) =>
      mixAt(sig, karplusStrong(midiToFrequency(64), 0.6, SR, { seed: 10 + i }), t, SR),
    );
    return sig;
  },
  sustained: () => {
    const sig = silence(1.5, SR);
    mixAt(sig, sine(440, 1, SR), 0.25, SR);
    return sig;
  },
  overNoise: () => {
    const sig = whiteNoise(1, SR, 0.005, 99);
    mixAt(sig, pluck(midiToFrequency(67), 0.6, SR), 0.4, SR);
    return sig;
  },
  dynamics: () => {
    const sig = silence(1.2, SR);
    mixAt(sig, pluck(440, 0.4, SR, { amplitude: 0.05 }), 0.1, SR);
    mixAt(sig, pluck(440, 0.4, SR, { amplitude: 0.6 }), 0.7, SR);
    return sig;
  },
  // Close to the rise threshold: detected at riseDb 10, not at 12 (0.012);
  // detected at 8, not at 10 (0.008).
  softReplucks_rise_between_10_and_12: () => ringingC4Then(0.012),
  softReplucks_rise_between_8_and_10: () => ringingC4Then(0.008),
  // Close to the 70 ms refractory period: gap 60 ms merges, 75 ms does not.
  pluckGap_60ms: () => twoPlucksGap(0.06),
  pluckGap_75ms: () => twoPlucksGap(0.075),
};

function onsets() {
  return Object.fromEntries(
    Object.entries(onsetScenarios).map(([k, make]) => [k, detectOnsets(make())]),
  );
}

// ---- analyzer stream ----------------------------------------------------

function analyzer() {
  const sig = silence(1.5, SR);
  mixAt(sig, karplusStrong(midiToFrequency(60), 1, SR), 0.5, SR);
  const a = new InputAnalyzer(SR);
  const msgs = [];
  for (const [b, s] of blocks(sig)) msgs.push(...a.process(b, 480000 + s));
  const events = msgs.flatMap((m) => (m.type === 'input' ? [m.event] : []));
  const frames = msgs.flatMap((m) => (m.type === 'frame' ? [m.frame] : []));
  const nearest = (t: number) =>
    frames.reduce((best, f) => (Math.abs(f.time - t) < Math.abs(best.time - t) ? f : best));
  return {
    events: events.map((e) => [round(e.time, 6), e.kind, round(e.velocity ?? NaN, 3)]),
    frameCount: frames.length,
    samples: [10.2, 10.6, 10.9, 11.3].map((t) => {
      const f = nearest(t);
      return [
        round(f.time, 4),
        round(f.rmsDb, 2),
        round(f.peakDb, 2),
        f.pitchHz === null ? null : round(f.pitchHz, 3),
        round(f.clarity, 3),
      ];
    }),
  };
}

// ---- note math ----------------------------------------------------------

function notes() {
  return [82.41, 196, 261.626, 329.628, 391.995, 440, 466.164, 880, 1000, 1318.5].map((hz) => {
    const n = noteFromFrequency(hz);
    const o = nearestOpenString(hz);
    return [hz, n.label, n.midi, round(n.cents, 3), o.string.label, round(o.cents, 3)];
  });
}

export function recordAll() {
  return {
    pitchStrings: pitchStrings(),
    pitchBoundaries: pitchBoundaries(),
    onsets: onsets(),
    analyzer: analyzer(),
    notes: notes(),
  };
}
