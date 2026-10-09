/** The pieces of the browser the global scope must offer (a parameter so tests can fake them). */
export interface AudioScope {
  AudioContext?: { prototype: object } | undefined;
  AudioWorkletNode?: unknown;
}

/**
 * Can this browser run the input worklet at all? The microphone path and the
 * auto-play demo both need it, so check this on its own: a browser without a
 * microphone (or with it blocked) can still play the demo.
 */
export function workletSupported(scope: AudioScope = globalThis as AudioScope): boolean {
  return (
    typeof scope.AudioContext !== 'undefined' &&
    typeof scope.AudioWorkletNode !== 'undefined' &&
    'audioWorklet' in scope.AudioContext.prototype
  );
}
