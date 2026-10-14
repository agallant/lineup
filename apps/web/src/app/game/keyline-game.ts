import {
  DiscreteJudge,
  GameSession,
  discreteConfigFromProfile,
  midiToFrequency,
  type Chart,
  type InputEvent,
  type InstrumentProfile,
  type Judgment,
  type SongClock,
} from '@lineup/core';
import type { HitFlash, RenderView } from '@lineup/render';

/** Flashes older than this are dropped, seconds. */
const FLASH_KEEP = 0.5;

export interface KeylineGameOptions {
  chart: Chart;
  profile: InstrumentProfile;
  clock: SongClock;
  /** Calibrated latency offset, seconds (a MIDI keyboard has little, but the speaker still has some). */
  latencyOffset: number;
}

/**
 * Keyline without the DOM: key presses (from a MIDI keyboard, the on-screen keys or the computer
 * keyboard) become pitched hits for the judge, and the held keys are kept for drawing.
 * Every press is a hit of its own, so a chord is judged note by note.
 */
export class KeylineGame {
  readonly session: GameSession<InputEvent>;
  readonly judge: DiscreteJudge;
  private readonly clock: SongClock;
  private readonly chart: Chart;
  private readonly profile: InstrumentProfile;
  private readonly offset: number;
  private readonly held = new Set<number>();
  private hits: HitFlash[] = [];
  /** Presses so far, wanted or not. */
  total = 0;

  constructor({ chart, profile, clock, latencyOffset }: KeylineGameOptions) {
    this.chart = chart;
    this.profile = profile;
    this.clock = clock;
    this.offset = latencyOffset;
    this.judge = new DiscreteJudge(chart.notes, discreteConfigFromProfile(profile, latencyOffset));
    this.session = new GameSession(chart, this.judge, clock);
  }

  /** A key goes down at `ctxTime` (seconds on the audio clock); velocity is 0..1. */
  press(midi: number, ctxTime: number, velocity = 0.8): void {
    this.held.add(midi);
    this.total++;
    const songTime = this.clock.toSongTime(ctxTime);
    this.session.feed({
      time: songTime,
      kind: 'onset',
      pitch: midiToFrequency(midi),
      velocity,
    });
    this.hits.push({ time: songTime - this.offset, lane: String(midi), velocity });
  }

  release(midi: number): void {
    this.held.delete(midi);
  }

  /** Lets go of every key (a keyboard unplugged, or the page hidden, would otherwise leave them stuck). */
  releaseAll(): void {
    this.held.clear();
  }

  update(): Judgment[] {
    const resolved = this.session.update();
    const cutoff = this.viewTime - FLASH_KEEP;
    if (this.hits.length && this.hits[0]!.time < cutoff)
      this.hits = this.hits.filter((h) => h.time >= cutoff);
    return resolved;
  }

  finish(): void {
    this.session.finish();
  }

  /** Song time as the player experiences it: the clock minus the calibrated latency. */
  get viewTime(): number {
    return this.clock.now() - this.offset;
  }

  view(): RenderView {
    return {
      time: this.viewTime,
      notes: this.chart.notes,
      statuses: this.session.statuses,
      profile: this.profile,
      hits: this.hits,
      pressed: [...this.held],
    };
  }

  /** The calibrated latency offset the judge applies, ms. */
  get latencyOffsetMs(): number {
    return this.offset * 1000;
  }

  /** Presses that matched no note (wrong key, double press). */
  get strays(): number {
    return this.judge.strays;
  }
}
