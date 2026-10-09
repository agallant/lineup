import type { InstrumentProfile } from '@lineup/core';
import type { OnsetDetectorOptions } from './dsp/onset';
import type { PitchTrackerOptions } from './dsp/pitch';
import type { InputAnalyzerOptions } from './dsp/analyzer';

/** Detector options for the profile's pitch window and gates. */
export function pitchOptionsFromProfile(profile: InstrumentProfile): PitchTrackerOptions {
  const d = profile.detector;
  return {
    windowSize: d.windowSize,
    hopSize: d.hopSize,
    minClarity: d.clarityThreshold,
    minDb: d.minLevelDb,
    minHz: d.minHz,
    maxHz: d.maxHz,
    ...(d.foldIntoRange ? { foldIntoRange: true } : {}),
  };
}

/** Onset detector options from the profile (the profile uses ms, the detector seconds). */
export function onsetOptionsFromProfile(profile: InstrumentProfile): OnsetDetectorOptions {
  const o = profile.detector.onset;
  return {
    riseDb: o.riseDb,
    lookback: o.lookbackMs / 1000,
    minDb: o.minLevelDb,
    refractory: o.refractoryMs / 1000,
  };
}

export function analyzerOptionsFromProfile(profile: InstrumentProfile): InputAnalyzerOptions {
  if (profile.input === 'percussion') {
    return { percussion: { onset: onsetOptionsFromProfile(profile) } };
  }
  return { pitch: pitchOptionsFromProfile(profile), onset: onsetOptionsFromProfile(profile) };
}
