import { describe, expect, it } from 'vitest';
import { micAdvice, type MicStats } from './mic-advice';

const cases: [string, MicStats, string][] = [
  ['clipping beats everything', { levelDb: -10, peakDb: -0.5, voicedFraction: 1 }, 'clipping'],
  [
    'a peak just under the clip line is fine',
    { levelDb: -20, peakDb: -3, voicedFraction: 1 },
    'good',
  ],
  ['nothing at all', { levelDb: -90, peakDb: -80, voicedFraction: 0 }, 'silent'],
  ['faint sound', { levelDb: -55, peakDb: -40, voicedFraction: 0.9 }, 'quiet'],
  [
    'loud but no steady pitch (whisper, noise)',
    { levelDb: -30, peakDb: -15, voicedFraction: 0.2 },
    'unclear',
  ],
  ['healthy', { levelDb: -28, peakDb: -12, voicedFraction: 0.9 }, 'good'],
  [
    'boundary: -48 dB is no longer quiet',
    { levelDb: -48, peakDb: -30, voicedFraction: 0.5 },
    'good',
  ],
  ['boundary: 40% voiced is enough', { levelDb: -30, peakDb: -15, voicedFraction: 0.4 }, 'good'],
];

describe('micAdvice', () => {
  it.each(cases)('%s', (_name, stats, status) => {
    expect(micAdvice(stats).status).toBe(status);
  });

  it('always says something a person can act on', () => {
    for (const [, stats] of cases) expect(micAdvice(stats).message.length).toBeGreaterThan(15);
  });
});
