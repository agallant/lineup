/**
 * The processing we need OFF for a musical instrument: these are tuned for
 * speech and smear attacks, pump levels, and add latency.
 */
export const DISABLED_PROCESSING = [
  'echoCancellation',
  'noiseSuppression',
  'autoGainControl',
] as const;

export type ProcessingKey = (typeof DISABLED_PROCESSING)[number];

export function audioConstraints(deviceId?: string): MediaTrackConstraints {
  const c: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };
  if (deviceId) c.deviceId = { exact: deviceId };
  return c;
}

/**
 * 'off': browser reports it disabled (what we want).
 * 'on': browser reports it still enabled (bad).
 * 'unreported': the browser doesn't say (common in Safari for some keys).
 */
export type ConstraintStatus = 'off' | 'on' | 'unreported';

export interface ConstraintRow {
  key: ProcessingKey;
  supported: boolean;
  status: ConstraintStatus;
}

export function constraintReport(
  settings: MediaTrackSettings,
  supported: MediaTrackSupportedConstraints,
): ConstraintRow[] {
  return DISABLED_PROCESSING.map((key) => {
    const applied = settings[key];
    const status: ConstraintStatus = applied === undefined ? 'unreported' : applied ? 'on' : 'off';
    return { key, supported: supported[key] === true, status };
  });
}
