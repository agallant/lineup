import type { Chart, InstrumentProfile, NoteStatus } from '@lineup/core';
import type { RenderView } from '@lineup/render';

/**
 * Beginner step mode for the keyboard, without the DOM: no clock and no timing. The notes that start
 * together (a chord) are asked as one step; the player presses them (in any order, not necessarily
 * at once) to move on, or skips the step.
 */
export class KeyStepGame {
  /** The steps: the keys asked together, and which notes of the chart they are. */
  readonly steps: { t: number; pitches: number[]; noteIndexes: number[] }[] = [];
  readonly statuses: NoteStatus[];
  /** Hear-again requests, and presses of keys that were not asked. */
  hears = 0;
  wrong = 0;
  /** The step being asked; `steps.length` when finished. */
  index = 0;
  private got = new Set<number>();
  private readonly held = new Set<number>();

  constructor(
    private readonly chart: Chart,
    private readonly profile: InstrumentProfile,
  ) {
    this.statuses = chart.notes.map(() => 'pending' as NoteStatus);
    chart.notes.forEach((n, i) => {
      if (n.pitch === undefined) return;
      const last = this.steps[this.steps.length - 1];
      if (last && Math.abs(last.t - n.t) < 0.02) {
        last.pitches.push(n.pitch);
        last.noteIndexes.push(i);
      } else this.steps.push({ t: n.t, pitches: [n.pitch], noteIndexes: [i] });
    });
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  /** The keys asked now (empty when finished). */
  get target(): readonly number[] {
    return this.done ? [] : this.steps[this.index]!.pitches;
  }

  /** The asked keys not yet pressed. */
  get remaining(): number[] {
    return this.target.filter((p) => !this.got.has(p));
  }

  /** A key goes down. Returns true when it completed the step. */
  press(midi: number): boolean {
    this.held.add(midi);
    if (this.done) return false;
    if (!this.target.includes(midi)) {
      this.wrong++;
      return false;
    }
    this.got.add(midi);
    if (this.remaining.length > 0) return false;
    this.mark('perfect');
    return true;
  }

  release(midi: number): void {
    this.held.delete(midi);
  }

  releaseAll(): void {
    this.held.clear();
  }

  hearAgain(): void {
    this.hears++;
  }

  skip(): void {
    if (!this.done) this.mark('miss');
  }

  private mark(status: NoteStatus): void {
    for (const i of this.steps[this.index]!.noteIndexes) this.statuses[i] = status;
    this.index++;
    this.got = new Set();
  }

  /** Steps passed and skipped. */
  get passed(): number {
    return this.steps.filter((s) => this.statuses[s.noteIndexes[0]!] === 'perfect').length;
  }
  get skipped(): number {
    return this.steps.filter((s) => this.statuses[s.noteIndexes[0]!] === 'miss').length;
  }
  get accuracy(): number {
    return this.steps.length ? this.passed / this.steps.length : 0;
  }

  /** The picture: the asked notes sit on the keyboard, with the keys held lit. */
  view(): RenderView {
    const step = this.steps[Math.min(this.index, this.steps.length - 1)];
    return {
      time: (step?.t ?? 0) + 0.01,
      notes: this.chart.notes,
      statuses: this.statuses,
      profile: this.profile,
      pressed: [...this.held],
    };
  }
}
