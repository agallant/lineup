import { describe, expect, it } from 'vitest';
import { workletSupported, type AudioScope } from './capabilities';

/** Fakes for the globals a browser provides: only the shape the check looks at. */
const withWorklet = { prototype: { audioWorklet: {} } };
const withoutWorklet = { prototype: {} };
const node = () => undefined;

describe('workletSupported', () => {
  it('is true when AudioContext, AudioWorkletNode and audioWorklet all exist', () => {
    expect(workletSupported({ AudioContext: withWorklet, AudioWorkletNode: node })).toBe(true);
  });

  it.each<[string, AudioScope]>([
    ['no AudioContext', { AudioWorkletNode: node }],
    ['no AudioWorkletNode', { AudioContext: withWorklet }],
    [
      'an AudioContext without audioWorklet (old Safari)',
      { AudioContext: withoutWorklet, AudioWorkletNode: node },
    ],
    ['an empty scope', {}],
  ])('is false with %s', (_name, scope) => {
    expect(workletSupported(scope)).toBe(false);
  });

  it('is false in Node, where there is no Web Audio', () => {
    expect(workletSupported()).toBe(false);
  });
});
