import type { Chart, InstrumentProfile, NoteStatus } from '@lineup/core';
import type { RenderView } from '@lineup/render';

/** One step: what to play, and the notes of the chart it stands for. */
export interface HitStep {
  t: number;
  /** The lane to hit (a multi-lane percussion profile), or null when any hit will do. */
  lane: string | null;
  /** The chord to strum, or null. */
  chord: string | null;
  /** How many times in a row, for a run of the same hit. */
  count: number;
  noteIndexes: number[];
}

export interface HitStepOptions {
  /** Also require the chord to be recognised (strumming with chord checking on). */
  needChord?: boolean;
}

/**
 * Beginner step mode for the hit games, without the DOM: no clock and no timing. A run of the same
 * hit (a chord, a drum sound) is one step: it is played aloud, and the player plays it back to move
 * on, or skips it. The caller mutes the input while the step sounds.
 */
export class HitStepGame {
  readonly steps: HitStep[] = [];
  readonly statuses: NoteStatus[];
  readonly labels: string[] = [];
  hears = 0;
  /** Hits that were not the asked one. */
  wrong = 0;
  index = 0;
  private mutedUntil = -Infinity;
  private got = 0;

  constructor(
    private readonly chart: Chart,
    private readonly profile: InstrumentProfile,
    private readonly options: HitStepOptions = {},
  ) {
    this.statuses = chart.notes.map(() => 'pending' as NoteStatus);
    const lanes = new Set(chart.notes.map((n) => n.lane).filter((l) => l !== undefined));
    // only a percussion profile's lanes are different sounds (a strum's are just its direction)
    const byLane = profile.input === 'percussion' && lanes.size > 1;
    chart.notes.forEach((n, i) => {
      const chord = n.expected?.chord ?? null;
      const lane = byLane ? (n.lane ?? null) : null;
      const last = this.steps[this.steps.length - 1];
      // a run of the same chord or lane is one step; plain notes (picked, a single drum) are one each
      const same =
        last && (chord !== null || lane !== null) && last.chord === chord && last.lane === lane;
      if (same) {
        last.count++;
        last.noteIndexes.push(i);
      } else {
        this.steps.push({ t: n.t, lane, chord, count: 1, noteIndexes: [i] });
      }
    });
    this.labels = this.steps.map((s) => this.label(s));
  }

  /** "Am", "kick ×3" or "hit": what a step is called. */
  label(s: HitStep): string {
    const base = s.chord ?? s.lane ?? 'hit';
    return s.count > 1 ? `${base} ×${s.count}` : base;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  get step(): HitStep | null {
    return this.done ? null : this.steps[this.index]!;
  }

  get position(): { at: number; of: number } {
    return { at: Math.min(this.index + 1, this.steps.length), of: this.steps.length };
  }

  /** What the player has to do now, in words. */
  get prompt(): string {
    const s = this.step;
    if (!s) return '';
    const what = s.chord ? `strum ${s.chord}` : s.lane ? `hit the ${s.lane}` : 'play it';
    const times = s.count > 1 ? ` ${s.count} times` : '';
    return `${what[0]!.toUpperCase()}${what.slice(1)}${times}`;
  }

  muteUntil(ctxTime: number): void {
    this.mutedUntil = ctxTime;
    this.got = 0;
  }

  hearAgain(): void {
    this.hears++;
    this.got = 0;
  }

  skip(): void {
    if (this.done) return;
    this.mark('miss');
  }

  /**
   * Feeds one detected hit (its lane and chord, as classified). Returns true when it completed the step.
   * A hit in the wrong lane, or a strum of the wrong chord when chords are checked, is counted wrong.
   */
  feed(hit: { time: number; lane?: string | undefined; chord?: string | undefined }): boolean {
    const s = this.step;
    if (!s || hit.time < this.mutedUntil) return false;
    const laneOk = s.lane === null || hit.lane === s.lane;
    const chordOk = !this.options.needChord || s.chord === null || hit.chord === s.chord;
    if (!laneOk || !chordOk) {
      this.wrong++;
      return false;
    }
    this.got++;
    if (this.got < s.count) return false;
    this.mark('perfect');
    return true;
  }

  private mark(status: NoteStatus): void {
    for (const i of this.steps[this.index]!.noteIndexes) this.statuses[i] = status;
    this.index++;
    this.got = 0;
  }

  get passed(): number {
    return this.steps.filter((s) => this.statuses[s.noteIndexes[0]!] === 'perfect').length;
  }
  get skipped(): number {
    return this.steps.filter((s) => this.statuses[s.noteIndexes[0]!] === 'miss').length;
  }
  get accuracy(): number {
    return this.steps.length ? this.passed / this.steps.length : 0;
  }
  /** The steps, standing in for notes in the results. */
  get notes(): { length: number } {
    return this.steps;
  }

  view(): RenderView {
    const s = this.steps[Math.min(this.index, this.steps.length - 1)];
    return {
      time: (s?.t ?? 0) + 0.01,
      notes: this.chart.notes,
      statuses: this.statuses,
      profile: this.profile,
      hits: [],
    };
  }
}
