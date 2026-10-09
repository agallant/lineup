import type { InputEvent } from '@lineup/core';
import type { AnalyzerMessage } from './types';

export interface OnsetPitchOptions {
  /** Ignore the attack transient: read pitch starting this long after the onset, seconds. */
  skip?: number;
  /** ...until this long after the onset, seconds. */
  until?: number;
}

/**
 * An onset is known within a few ms, but the pitch of a plucked note is only
 * reliable once the attack noise has died down. This holds each onset until
 * the pitch frames covering [onset+skip, onset+until] have arrived, then
 * emits the event with the median voiced pitch attached. The event keeps the
 * ORIGINAL onset time, so judging is unaffected by the wait; the judge's
 * `settle` just has to cover it (see discreteConfigFromProfile).
 */
export class OnsetPitchAttacher {
  private readonly skip: number;
  private readonly until: number;
  private readonly pending: InputEvent[] = [];
  private frames: { time: number; hz: number }[] = [];

  constructor({ skip = 0.04, until = 0.14 }: OnsetPitchOptions = {}) {
    this.skip = skip;
    this.until = until;
  }

  /** Total delay after an onset before its event can be emitted, seconds (plus one hop). */
  get delay(): number {
    return this.until;
  }

  push(message: AnalyzerMessage): InputEvent[] {
    if (message.type === 'input') {
      this.pending.push(message.event);
      return [];
    }
    const { time, pitchHz } = message.frame;
    if (pitchHz !== null) this.frames.push({ time, hz: pitchHz });
    const ready: InputEvent[] = [];
    while (this.pending.length && time >= this.pending[0]!.time + this.until) {
      ready.push(this.attach(this.pending.shift()!));
    }
    // Keep only frames a pending (or future) onset could still need.
    const horizon = (this.pending[0]?.time ?? time) + this.skip - 0.5;
    this.frames = this.frames.filter((f) => f.time >= horizon);
    return ready;
  }

  /** Emit everything still waiting (end of input), with whatever pitch is known. */
  flush(): InputEvent[] {
    return this.pending.splice(0).map((e) => this.attach(e));
  }

  private attach(event: InputEvent): InputEvent {
    const lo = event.time + this.skip;
    const hi = event.time + this.until;
    const hzs = this.frames
      .filter((f) => f.time >= lo && f.time <= hi)
      .map((f) => f.hz)
      .sort((a, b) => a - b);
    if (hzs.length === 0) return event;
    const mid = hzs.length >> 1;
    const median = hzs.length % 2 ? hzs[mid]! : (hzs[mid - 1]! + hzs[mid]!) / 2;
    return { ...event, pitch: median };
  }
}
