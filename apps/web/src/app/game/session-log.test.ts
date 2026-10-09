import type { Judgment, ScoreState } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { formatSessionLog, type SessionLogInput } from './session-log';

const score: ScoreState = {
  score: 1234,
  combo: 2,
  maxCombo: 5,
  multiplier: 2,
  counts: { perfect: 3, good: 1, miss: 1 },
  judged: 5,
  accuracy: 0.78,
};

const judgments: Judgment[] = [
  {
    noteIndex: 0,
    note: { t: 1, duration: 1, pitch: 60 },
    grade: 'perfect',
    credit: 1,
    timingError: 0.034,
    reason: null,
    pitchErrorCents: -12.4,
    coverage: 0.91,
    resolvedAt: 2.2,
  },
  {
    noteIndex: 1,
    note: { t: 2.5, duration: 0.5, lane: 'clap' },
    grade: 'miss',
    credit: 0,
    timingError: null,
    reason: 'no-input',
    resolvedAt: 3.2,
  },
];

const base: SessionLogInput = {
  build: 'main · c0d87be · built 2026-10-09 21:28 UTC',
  mode: 'Singline',
  at: new Date('2026-10-09T22:00:00Z'),
  userAgent: 'TestAgent/1.0',
  profileId: 'voice',
  songTitle: 'Scale',
  demo: false,
  options: { difficulty: 'normal', key: 2 },
  audio: { sampleRate: 48000, baseLatency: 0.01, outputLatency: 0.04 },
  latencyOffsetMs: 85,
  micSettings: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  score,
  grade: 'B',
  judgments,
};

describe('formatSessionLog', () => {
  const text = formatSessionLog(base);

  it('names the build, device and setup', () => {
    expect(text).toContain('Lineup session log: Singline');
    expect(text).toContain('c0d87be');
    expect(text).toContain('TestAgent/1.0');
    expect(text).toContain('difficulty=normal');
    expect(text).toContain('48000 Hz');
    expect(text).toContain('baseLatency 10.0 ms');
    expect(text).toContain('outputLatency 40.0 ms');
    expect(text).toContain('85 ms applied');
    expect(text).toContain('echoCancellation=false');
  });

  it('summarises the score', () => {
    expect(text).toContain('score 1234');
    expect(text).toContain('accuracy 78%');
    expect(text).toContain('grade B');
    expect(text).toContain('best combo 5');
  });

  it('lists every note with its result', () => {
    expect(text).toContain('midi 60');
    expect(text).toContain('perfect');
    expect(text).toContain('cov 0.91');
    expect(text).toContain('pitch -12 c');
    expect(text).toContain('timing +34 ms');
    expect(text).toContain('clap');
    expect(text).toContain('miss (no-input)');
  });

  it('marks the demo and includes the Beatline extras only when given', () => {
    expect(text).not.toContain('extra hits');
    expect(text).not.toContain('hit monitor');
    const beat = formatSessionLog({
      ...base,
      mode: 'Beatline',
      demo: true,
      strays: 2,
      hits: '0.500s v0.80 clap',
    });
    expect(beat).toContain('Beatline (auto-play demo)');
    expect(beat).toContain('extra hits 2');
    expect(beat).toContain('hit monitor:\n0.500s v0.80 clap');
  });

  it('copes with a missing audio context and mic', () => {
    const t = formatSessionLog({ ...base, audio: null, micSettings: undefined });
    expect(t).not.toContain('audio:');
    expect(t).not.toContain('mic:');
  });
});
