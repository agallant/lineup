import type { TimeSource } from '@lineup/core';
import type { AnalyzerMessage } from './types';

/**
 * A live source of analyzer messages: a microphone, a synthetic performer,
 * and later desktop MIDI/pad input. The game only needs three things from it:
 * the clock its message times are on, a message callback, and a way to stop.
 * Message times are uncorrected seconds on `clock`; the app converts them to
 * song time with a SongClock built on the same `clock`.
 */
export interface InputAdapter {
  readonly kind: 'mic' | 'synthetic' | 'midi';
  /** The clock `message.time` values are on (an AudioContext for audio adapters). */
  readonly clock: TimeSource;
  /** Receives every message. Set before starting. */
  onMessage: (message: AnalyzerMessage) => void;
  close(): Promise<void>;
}
