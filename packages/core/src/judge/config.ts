import type { InstrumentProfile } from '../profile';
import type { DiscreteJudgeConfig } from './discrete';

/** Fallback pitch tolerance when a profile asks for pitch matching without pitch settings. */
const DEFAULT_PITCH_TOLERANCE_CENTS = 50;

/** Builds the discrete judge's config from a profile plus the player's calibrated offset (seconds). */
export function discreteConfigFromProfile(
  profile: InstrumentProfile,
  latencyOffset: number,
): DiscreteJudgeConfig {
  const { timing, match, pitch } = profile.judgment;
  return {
    perfectWindow: timing.perfectMs / 1000,
    goodWindow: timing.goodMs / 1000,
    latencyOffset,
    goodCredit: 0.5,
    matchLane: match.lane,
    requireLane: match.laneStrict ?? false,
    matchChord: match.chord,
    requireChord: match.chordStrict ?? false,
    pitchToleranceCents: match.pitch
      ? (pitch?.toleranceCents ?? DEFAULT_PITCH_TOLERANCE_CENTS)
      : null,
    octaveForgiving: pitch?.octaveForgiving ?? false,
    // Pitch-matched events are emitted only after the pitch frames after the
    // attack have arrived (~0.14 s + a hop), so wait longer before declaring a miss.
    // chords are recognised from ~0.2 s of audio after the strum
    settle: match.chord ? 0.4 : match.pitch || match.laneStrict ? 0.2 : 0.05,
  };
}
