import { describe, expect, it } from 'vitest';
import { audioConstraints, constraintReport } from './constraints';

describe('audioConstraints', () => {
  it('disables all voice processing', () => {
    expect(audioConstraints()).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it('pins a chosen device', () => {
    expect(audioConstraints('abc').deviceId).toEqual({ exact: 'abc' });
  });
});

describe('constraintReport', () => {
  it('distinguishes off, on and unreported', () => {
    const rows = constraintReport(
      { echoCancellation: false, noiseSuppression: true },
      { echoCancellation: true, noiseSuppression: true },
    );
    expect(rows).toEqual([
      { key: 'echoCancellation', supported: true, status: 'off' },
      { key: 'noiseSuppression', supported: true, status: 'on' },
      { key: 'autoGainControl', supported: false, status: 'unreported' },
    ]);
  });
});
