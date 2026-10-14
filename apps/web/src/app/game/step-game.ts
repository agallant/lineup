import {
  deviationCents,
  type Chart,
  type InstrumentProfile,
  type NoteStatus,
  type PitchFrame,
} from '@lineup/core';
import { foldMidiNear, type RenderView, type TrailPoint } from '@lineup/render';

/** How long the right pitch must be held to pass a note, seconds. */
export const HOLD_S = 0.4;
/** A dropout shorter than this does not break a hold (voices waver), seconds. */
const GAP_S = 0.15;
/** Beginner mode is kinder than the timed game: this many extra cents either way. */
const EXTRA_CENTS = 25;
/** The trail shows this much of the recent past, seconds. */
const TRAIL_S = 3;

export interface StepGameOptions {
  chart: Chart;
  profile: InstrumentProfile;
  /** Hold time to pass a note, seconds. */
  hold?: number;
}

/**
 * Beginner step mode, without the DOM: no clock and no timing. The notes of the song are asked one at
 * a time; the player reproduces the note (held for a moment) to pass it, or skips it. The caller
 * plays the note aloud and mutes the input while it sounds, so the microphone does not hear it.
 */
export class StepGame {
  readonly notes: Chart['notes'];
  /** How each note ended, by index. */
  readonly statuses: NoteStatus[];
  /** Hears-again requests so far, over the whole song. */
  hears = 0;
  /** The note being asked, an index into the notes; `notes.length` when finished. */
  index = 0;
  private readonly hold: number;
  private readonly tolerance: number;
  private readonly forgiving: boolean;
  private readonly minClarity: number;
  private readonly minLevel: number;
  private onSince: number | null = null;
  private lastOn = 0;
  private mutedUntil = -Infinity;
  private trail: { at: number; midi: number | null; on: boolean }[] = [];
  private latest = 0;

  constructor(
    private readonly chart: Chart,
    private readonly profile: InstrumentProfile,
    hold = HOLD_S,
  ) {
    this.notes = chart.notes.filter((n) => n.pitch !== undefined);
    this.statuses = this.notes.map(() => 'pending' as NoteStatus);
    this.hold = hold;
    const p = profile.judgment.pitch;
    this.tolerance = (p?.toleranceCents ?? 50) + EXTRA_CENTS;
    this.forgiving = p?.octaveForgiving ?? false;
    this.minClarity = profile.detector.clarityThreshold;
    this.minLevel = profile.detector.minLevelDb;
  }

  get done(): boolean {
    return this.index >= this.notes.length;
  }

  /** The MIDI pitch being asked, or null when finished. */
  get target(): number | null {
    return this.done ? null : this.notes[this.index]!.pitch!;
  }

  /** Ignores the input until `ctxTime` (the note is sounding, and the microphone would hear it). */
  muteUntil(ctxTime: number): void {
    this.mutedUntil = ctxTime;
    this.onSince = null;
  }

  /** Counts a request to hear the note again. */
  hearAgain(): void {
    this.hears++;
    this.onSince = null;
  }

  /** Gives up on this note and goes on to the next. */
  skip(): void {
    if (this.done) return;
    this.statuses[this.index] = 'miss';
    this.advance();
  }

  /** Feeds one pitch reading. Returns true when it passed the note being asked. */
  feed(frame: PitchFrame): boolean {
    this.latest = Math.max(this.latest, frame.time);
    const target = this.target;
    if (target === null || frame.time < this.mutedUntil) return false;
    const hz = frame.frequency;
    const voiced =
      hz !== null && hz > 0 && frame.clarity >= this.minClarity && frame.level >= this.minLevel;
    const dev = voiced ? deviationCents(hz, target, this.forgiving) : null;
    const on = dev !== null && Math.abs(dev) <= this.tolerance;
    const midi = voiced ? 69 + 12 * Math.log2(hz / 440) : null;
    this.trail.push({
      at: frame.time,
      midi: midi === null ? null : this.forgiving ? foldMidiNear(midi, target) : midi,
      on,
    });
    const cutoff = frame.time - TRAIL_S;
    while (this.trail.length && this.trail[0]!.at < cutoff) this.trail.shift();
    if (on) {
      this.onSince ??= frame.time;
      this.lastOn = frame.time;
      if (frame.time - this.onSince >= this.hold) {
        this.statuses[this.index] = 'perfect';
        this.advance();
        return true;
      }
    } else if (this.onSince !== null && frame.time - this.lastOn > GAP_S) {
      this.onSince = null;
    }
    return false;
  }

  private advance(): void {
    this.index++;
    this.onSince = null;
    this.trail = [];
  }

  /** Notes passed so far. */
  get passed(): number {
    return this.statuses.filter((s) => s === 'perfect').length;
  }

  /** Notes skipped so far. */
  get skipped(): number {
    return this.statuses.filter((s) => s === 'miss').length;
  }

  /** Share of the notes passed rather than skipped. */
  get accuracy(): number {
    return this.notes.length ? this.passed / this.notes.length : 0;
  }

  /** The picture: the asked note sits on the now line, with the player's recent pitch behind it. */
  view(): RenderView {
    const note = this.notes[Math.min(this.index, this.notes.length - 1)];
    const time = (note?.t ?? 0) + 0.01;
    const trail: TrailPoint[] = this.trail.map((p) => ({
      time: time - (this.latest - p.at),
      midi: p.midi,
      onPitch: p.on,
    }));
    const since = this.onSince;
    const held = since === null ? 0 : Math.min(1, (this.lastOn - since) / this.hold);
    return {
      time,
      // the notes keep their chart times; only the asked one is at the line
      notes: this.notes,
      statuses: this.statuses,
      profile: this.profile,
      trail,
      live: { noteIndex: this.done ? null : this.index, onPitch: since !== null, coverage: held },
    };
  }

  /** Where the song is, for a "note 3 of 12" label. */
  get position(): { at: number; of: number } {
    return { at: Math.min(this.index + 1, this.notes.length), of: this.notes.length };
  }

  /** The chart this plays. */
  get source(): Chart {
    return this.chart;
  }
}
