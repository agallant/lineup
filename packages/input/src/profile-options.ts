import type { InstrumentProfile } from '@lineup/core';
import type { OnsetDetectorOptions } from './dsp/onset';
import type { PitchTrackerOptions } from './dsp/pitch';
import type { InputAnalyzerOptions } from './dsp/analyzer';
import type { ChordShapes } from './dsp/chord';

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

export interface AnalyzerExtras {
  /** For a strum profile: the chords the song uses (name -> sounding MIDI notes). Turns on chord recognition. */
  chords?: ChordShapes;
}

export function analyzerOptionsFromProfile(
  profile: InstrumentProfile,
  { chords }: AnalyzerExtras = {},
): InputAnalyzerOptions {
  if (profile.input === 'strum' && chords && Object.keys(chords).length > 0) {
    return { strum: { onset: onsetOptionsFromProfile(profile), chords } };
  }
  if (profile.input === 'percussion') {
    // the percussion detector names its options differently: lookbackMs is its referenceDelay
    const o = profile.detector.onset;
    return {
      percussion: {
        onset: {
          riseDb: o.riseDb,
          minDb: o.minLevelDb,
          refractory: o.refractoryMs / 1000,
          referenceDelay: o.lookbackMs / 1000,
        },
      },
    };
  }
  return { pitch: pitchOptionsFromProfile(profile), onset: onsetOptionsFromProfile(profile) };
}
