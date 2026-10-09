import {
  ContinuousJudge,
  applyDifficulty,
  GameSession,
  activeNoteIndex,
  continuousConfigFromProfile,
  deviationCents,
  noteFromFrequency,
  type Chart,
  type Difficulty,
  type InstrumentProfile,
  type Judgment,
  type PitchFrame,
  type SongClock,
} from '@lineup/core';
import { toPitchFrame, type AnalyzerMessage } from '@lineup/input';
import { PitchTrail, foldMidiNear, midiName, type RenderView } from '@lineup/render';

export interface DebugInfo {
  hz: number | null;
  /** Nearest note name of the raw detection, e.g. "A4". */
  note: string | null;
  /** Cents from that nearest note. */
  cents: number | null;
  clarity: number;
  levelDb: number;
  /** Passed the clarity and level gates (what the judge counts). */
  voiced: boolean;
  target: string | null;
  /** Cents from the target (octave-folded when the profile is octave-forgiving). */
  deviation: number | null;
  /** Whole octaves between the raw detection and the target: 0 normally; nonzero means an octave error or an octave-shifted singer. */
  octaves: number | null;
  /** Pitch frames per second received recently. */
  frameRate: number;
  latencyOffsetMs: number;
  /** Seconds since the newest frame (staleness). */
  frameAge: number | null;
}

export interface SinglineGameOptions {
  /** The chart as the player sees it (already transposed to their key). */
  chart: Chart;
  profile: InstrumentProfile;
  clock: SongClock;
  /** Calibrated latency offset, seconds. */
  latencyOffset: number;
  /** Seconds between pitch frames (hop / sample rate). */
  hop: number;
  /** How forgiving scoring is; the profile's own numbers when omitted ("strict"). */
  difficulty?: Difficulty;
}

/**
 * Everything the Singline screen needs, without the DOM: turns analyzer
 * messages into judge input and a pitch trail, advances the judge from the
 * song clock, and exposes render state and debug info.
 */
export class SinglineGame {
  readonly session: GameSession<PitchFrame>;
  readonly judge: ContinuousJudge;
  readonly trail = new PitchTrail(4);
  private readonly chart: Chart;
  private readonly profile: InstrumentProfile;
  private readonly clock: SongClock;
  private readonly offset: number;
  private readonly tolerance: number;
  private readonly forgiving: boolean;
  private lastRef = 60;
  private last: { frame: PitchFrame; ctxTime: number } | null = null;
  private recent: number[] = [];

  constructor({ chart, profile, clock, latencyOffset, hop, difficulty }: SinglineGameOptions) {
    this.chart = chart;
    this.profile = profile;
    this.clock = clock;
    this.offset = latencyOffset;
    this.judge = new ContinuousJudge(
      chart.notes,
      applyDifficulty(
        continuousConfigFromProfile(profile, latencyOffset, hop),
        difficulty ?? 'strict',
      ),
    );
    this.session = new GameSession(chart, this.judge, clock);
    this.tolerance = this.judge.config.toleranceCents;
    this.forgiving = profile.judgment.pitch?.octaveForgiving ?? false;
  }

  /** Feed every message from the input adapter. */
  handleMessage(message: AnalyzerMessage): void {
    if (message.type !== 'frame') return;
    const raw = toPitchFrame(message.frame);
    const songTime = this.clock.toSongTime(raw.time);
    const frame: PitchFrame = { ...raw, time: songTime };
    this.session.feed(frame);
    this.last = { frame: raw, ctxTime: raw.time };
    this.recent.push(raw.time);
    while (this.recent.length && raw.time - this.recent[0]! > 1) this.recent.shift();
    this.addTrailPoint(frame);
  }

  /** Call once per animation frame. */
  update(): Judgment[] {
    return this.session.update();
  }

  /** Song time as the player experiences it: the clock minus the calibrated latency. */
  get viewTime(): number {
    return this.clock.now() - this.offset;
  }

  view(): RenderView {
    const t = this.viewTime;
    const idx = activeNoteIndex(this.chart, t);
    const peek = idx === null ? null : this.judge.peek(idx, this.clock.now());
    return {
      time: t,
      notes: this.chart.notes,
      statuses: this.session.statuses,
      profile: this.profile,
      trail: this.trail.snapshot,
      live: {
        noteIndex: idx,
        onPitch: peek?.onPitchNow ?? false,
        coverage: peek?.coverage ?? 0,
      },
    };
  }

  debug(nowCtx: number): DebugInfo {
    const t = this.viewTime;
    const idx = activeNoteIndex(this.chart, t, 0.25);
    const target = idx === null ? null : (this.chart.notes[idx]!.pitch ?? null);
    const f = this.last?.frame ?? null;
    const hz = f?.frequency ?? null;
    const named = hz === null ? null : noteFromFrequency(hz);
    const cfg = this.judge.config;
    const voiced =
      f !== null && hz !== null && f.clarity >= cfg.minClarity && f.level >= cfg.minLevelDb;
    let deviation: number | null = null;
    let octaves: number | null = null;
    if (hz !== null && target !== null) {
      deviation = deviationCents(hz, target, this.forgiving);
      const raw = deviationCents(hz, target, false);
      octaves = Math.round(raw / 1200);
    }
    return {
      hz,
      note: named?.label ?? null,
      cents: named?.cents ?? null,
      clarity: f?.clarity ?? 0,
      levelDb: f?.level ?? -120,
      voiced,
      target: target === null ? null : midiName(target),
      deviation,
      octaves,
      frameRate: this.recent.length,
      latencyOffsetMs: this.offset * 1000,
      frameAge: this.last ? Math.max(0, nowCtx - this.last.ctxTime) : null,
    };
  }

  private addTrailPoint(frame: PitchFrame): void {
    const t = frame.time - this.offset;
    const cfg = this.judge.config;
    const idx = activeNoteIndex(this.chart, t, 0.25);
    const target = idx === null ? undefined : this.chart.notes[idx]!.pitch;
    if (target !== undefined) this.lastRef = target;
    const hz = frame.frequency;
    if (
      hz === null ||
      !(hz > 0) ||
      frame.clarity < cfg.minClarity ||
      frame.level < cfg.minLevelDb
    ) {
      this.trail.push({ time: t, midi: null, onPitch: false });
      return;
    }
    const midi = 69 + 12 * Math.log2(hz / 440);
    const display = this.forgiving ? foldMidiNear(midi, this.lastRef) : midi;
    const onPitch =
      target !== undefined &&
      Math.abs(deviationCents(hz, target, this.forgiving)) <= this.tolerance;
    this.trail.push({ time: t, midi: display, onPitch });
  }
}
