/// <reference types="node" />
/**
 * Characterization tests: lock in the CURRENT behaviour of the ukulele audio
 * pipeline (pitch tracker, onset detector, analyzer, note math) on fully
 * deterministic synthetic signals. Golden values live in
 * characterization.golden.json and were recorded from the code as it stood
 * before the Lineup monorepo refactor.
 *
 * If one of these fails after a refactor, behaviour changed: fix the code, not
 * the numbers. If a change is intentional, re-record with
 *   UPDATE_GOLDEN=1 npx vitest run characterization
 * and call out the golden diff in the PR.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recordAll } from './characterization.scenarios';
import golden from './characterization.golden.json';

const GOLDEN_PATH = new URL('./characterization.golden.json', import.meta.url);
const actual = recordAll();
// In update mode the new recording is the truth, so UPDATE_GOLDEN=1 exits green after rewriting the file.
const expected = process.env.UPDATE_GOLDEN ? actual : golden;

if (process.env.UPDATE_GOLDEN) {
  writeFileSync(GOLDEN_PATH, JSON.stringify(actual, null, 1) + '\n');
}

describe('characterization: ukulele audio pipeline', () => {
  it('pitch tracker: four open strings, additive pluck and Karplus-Strong', () => {
    expect(actual.pitchStrings).toEqual(expected.pitchStrings);
  });

  it('pitch tracker: noisy tones near the clarity gate and levels near the level gate', () => {
    expect(actual.pitchBoundaries).toEqual(expected.pitchBoundaries);
  });

  it.each(Object.keys(expected.onsets))('onset detector: %s', (name) => {
    expect(actual.onsets[name as keyof typeof actual.onsets]).toEqual(
      expected.onsets[name as keyof typeof expected.onsets],
    );
  });

  it('onset detector: scenario set is unchanged', () => {
    expect(Object.keys(actual.onsets)).toEqual(Object.keys(expected.onsets));
  });

  it('InputAnalyzer: onset events and analysis frames for a plucked C4', () => {
    expect(actual.analyzer).toEqual(expected.analyzer);
  });

  it('note math: names, cents and nearest open GCEA string', () => {
    expect(actual.notes).toEqual(expected.notes);
  });
});
