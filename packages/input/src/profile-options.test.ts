import { getProfile, midiToFrequency } from '@lineup/core';
import { blocks, karplusStrong, mixAt, pluck, silence } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import { InputAnalyzer } from './dsp/analyzer';
import { OnsetDetector } from './dsp/onset';
import { PitchTracker } from './dsp/pitch';
import {
  analyzerOptionsFromProfile,
  onsetOptionsFromProfile,
  pitchOptionsFromProfile,
} from './profile-options';

const SR = 48000;

describe('profile -> detector options', () => {
  const uke = getProfile('ukulele-strum');

  it('maps percussion onset fields to the percussion detector names (lookbackMs -> referenceDelay)', () => {
    const o = analyzerOptionsFromProfile(getProfile('clap')).percussion!.onset!;
    expect(o).toEqual({ riseDb: 9, minDb: -62, refractory: 0.06, referenceDelay: 0.013 });
  });

  it("a strum profile only switches to chord recognition when it is given the song's chords", () => {
    const strum = getProfile('ukulele-strum');
    expect(analyzerOptionsFromProfile(strum).strum).toBeUndefined();
    expect(analyzerOptionsFromProfile(strum, { chords: {} }).strum).toBeUndefined();
    const chords = { C: [67, 60, 64, 72] };
    const o = analyzerOptionsFromProfile(strum, { chords });
    expect(o.strum?.chords).toBe(chords);
    expect(o.strum?.onset).toEqual(onsetOptionsFromProfile(strum));
    expect(o.pitch).toBeUndefined();
    // other kinds of profile ignore chords
    expect(analyzerOptionsFromProfile(getProfile('voice'), { chords }).strum).toBeUndefined();
  });

  it('maps units (ms -> s) and names', () => {
    expect(pitchOptionsFromProfile(uke)).toEqual({
      windowSize: 2048,
      hopSize: 512,
      minClarity: 0.9,
      minDb: -60,
      minHz: 150,
      maxHz: 1400,
    });
    expect(onsetOptionsFromProfile(uke)).toEqual({
      riseDb: 10,
      lookback: 0.03,
      minDb: -60,
      refractory: 0.07,
    });
  });

  it('the ukulele profile reproduces the built-in detector defaults exactly (no behaviour change)', () => {
    const signal = silence(2, SR);
    [67, 60, 64, 69].forEach((m, i) =>
      mixAt(
        signal,
        i % 2
          ? karplusStrong(midiToFrequency(m), 0.8, SR, { seed: i })
          : pluck(midiToFrequency(m), 0.8, SR),
        0.2 + i * 0.4,
        SR,
      ),
    );

    const run = (pitch: PitchTracker, onset: OnsetDetector) => {
      const est = [];
      const ons = [];
      for (const [b, s] of blocks(signal)) {
        est.push(...pitch.process(b, s));
        ons.push(...onset.process(b, s));
      }
      return { est, ons };
    };
    const defaults = run(new PitchTracker(SR), new OnsetDetector(SR));
    const fromProfile = run(
      new PitchTracker(SR, pitchOptionsFromProfile(uke)),
      new OnsetDetector(SR, onsetOptionsFromProfile(uke)),
    );
    expect(fromProfile).toEqual(defaults);
    expect(defaults.ons.length).toBe(4);
  });

  it('InputAnalyzer built from a profile emits the same stream as the default one', () => {
    const signal = silence(1.2, SR);
    mixAt(signal, karplusStrong(midiToFrequency(60), 0.8, SR), 0.3, SR);
    const collect = (a: InputAnalyzer) => {
      const out = [];
      for (const [b, s] of blocks(signal)) out.push(...a.process(b, s));
      return out;
    };
    expect(collect(new InputAnalyzer(SR, analyzerOptionsFromProfile(uke)))).toEqual(
      collect(new InputAnalyzer(SR)),
    );
  });
});
