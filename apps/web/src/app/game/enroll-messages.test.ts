import type { EnrollOutcome } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { enrollMessage } from './enroll-messages';

describe('enrollMessage', () => {
  const outcomes: EnrollOutcome[] = [
    'accepted',
    'double',
    'too-quiet',
    'outlier',
    'no-features',
    'done',
  ];
  it('has a message for every outcome, and only success outcomes are ok', () => {
    for (const o of outcomes) {
      const m = enrollMessage(o, { label: 'Clap' }, 2, 6);
      expect(m.text.length).toBeGreaterThan(5);
      expect(m.ok).toBe(o === 'accepted' || o === 'done');
    }
  });
  it('shows progress for accepted hits', () => {
    expect(enrollMessage('accepted', { label: 'Tap' }, 3, 6).text).toBe('Got it (Tap 3/6).');
    expect(enrollMessage('accepted', null, 3, 6).text).toBe('Got it.');
  });
});
