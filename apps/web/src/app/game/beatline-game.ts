import {
  DiscreteJudge,
  GameSession,
  classifyEvent,
  discreteConfigFromProfile,
  type Chart,
  type InputEvent,
  type InstrumentProfile,
  type Judgment,
  type SongClock,
  type TimbreModel,
} from '@lineup/core';
import type { AnalyzerMessage } from '@lineup/input';
import { ANY_LANE, type HitFlash, type RenderView } from '@lineup/render';

/** One detected hit, as the debug overlay shows it. */
export interface HitRecord {
  /** Seconds on the AudioContext clock. */
  ctxTime: number;
  velocity: number;
  /** Lane the hit was put in; '' = rejected as unknown (or no lane in a multi-lane profile). */
  lane: string;
  /** Nearest enrolled class, even if the hit was rejected. Null without a model. */
  nearest: string | null;
  distance: number | null;
  margin: number | null;
  features: Readonly<Record<string, number>>;
  /** Chord the analyzer recognised in a strum, if any. */
  chord: string | null;
  chordScore: number | null;
}

/** Hits to keep for the overlay. */
const KEEP = 6;
/** Flashes older than this are dropped, seconds. */
const FLASH_KEEP = 0.5;

/**
 * Turns analyzer messages into classified hits: the input side of Beatline,
 * shared by the setup "hit monitor" and the game. DOM-free.
 */
export class HitMonitor {
  readonly recent: HitRecord[] = [];
  total = 0;
  rejected = 0;
  levelDb = -120;
  peakDb = -120;
  private lastCtx: number | null = null;

  constructor(
    readonly profile: InstrumentProfile,
    public model: TimbreModel | null,
  ) {}

  /** The lane a hit lands in on screen. A single-lane profile has exactly one place to put it. */
  private laneOf(event: InputEvent): string {
    if (event.lane !== undefined) return event.lane;
    const lanes = this.profile.lanes ?? [];
    if (lanes.length === 1) return lanes[0]!.id;
    // a strum has no lane of its own (its direction is not detected): it lights the whole now line
    return this.profile.input === 'strum' ? ANY_LANE : '';
  }

  /** Returns the classified event (AudioContext time) for a hit, or null for other messages. */
  push(message: AnalyzerMessage): { event: InputEvent; record: HitRecord } | null {
    if (message.type === 'frame') {
      this.levelDb = message.frame.rmsDb;
      this.peakDb = Math.max(message.frame.peakDb, this.peakDb - 0.4);
      this.lastCtx = message.frame.time;
      return null;
    }
    const { event, classification } = classifyEvent(this.profile, this.model, message.event);
    const record: HitRecord = {
      ctxTime: event.time,
      velocity: event.velocity ?? 0,
      lane: this.laneOf(event),
      nearest: classification?.nearest ?? null,
      distance: classification?.distance ?? null,
      margin: classification?.margin ?? null,
      features: event.features ?? {},
      chord: event.chord ?? null,
      chordScore: event.chordScore ?? null,
    };
    this.total++;
    if (this.model && classification && classification.id === null) this.rejected++;
    this.recent.push(record);
    if (this.recent.length > KEEP) this.recent.shift();
    return { event, record };
  }

  /** Seconds since the newest message, or null before any. */
  age(nowCtx: number): number | null {
    return this.lastCtx === null ? null : Math.max(0, nowCtx - this.lastCtx);
  }
}

export interface BeatlineGameOptions {
  chart: Chart;
  profile: InstrumentProfile;
  clock: SongClock;
  /** Calibrated latency offset, seconds. */
  latencyOffset: number;
  model: TimbreModel | null;
}

/** Everything the Beatline screen needs without the DOM. */
export class BeatlineGame {
  readonly session: GameSession<InputEvent>;
  readonly judge: DiscreteJudge;
  readonly monitor: HitMonitor;
  private readonly clock: SongClock;
  private readonly chart: Chart;
  private readonly profile: InstrumentProfile;
  private readonly offset: number;
  private hits: HitFlash[] = [];

  constructor({ chart, profile, clock, latencyOffset, model }: BeatlineGameOptions) {
    this.chart = chart;
    this.profile = profile;
    this.clock = clock;
    this.offset = latencyOffset;
    this.monitor = new HitMonitor(profile, model);
    this.judge = new DiscreteJudge(chart.notes, discreteConfigFromProfile(profile, latencyOffset));
    this.session = new GameSession(chart, this.judge, clock);
  }

  handleMessage(message: AnalyzerMessage): void {
    const hit = this.monitor.push(message);
    if (!hit) return;
    const songTime = this.clock.toSongTime(hit.event.time);
    this.session.feed({ ...hit.event, time: songTime });
    this.hits.push({
      time: songTime - this.offset,
      lane: hit.record.lane,
      velocity: hit.record.velocity,
    });
  }

  update(): Judgment[] {
    const resolved = this.session.update();
    const cutoff = this.viewTime - FLASH_KEEP;
    if (this.hits.length && this.hits[0]!.time < cutoff)
      this.hits = this.hits.filter((h) => h.time >= cutoff);
    return resolved;
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
    };
  }

  /** The calibrated latency offset the judge applies, ms. */
  get latencyOffsetMs(): number {
    return this.offset * 1000;
  }

  /** Hits that matched no note (stray taps, double triggers, wrong lane). */
  get strays(): number {
    return this.judge.strays;
  }
}

/** The multi-line debug text: newest hit first. */
export function formatHits(
  monitor: HitMonitor,
  nowCtx: number,
  { songTime, offsetMs, strays }: { songTime?: number; offsetMs?: number; strays?: number } = {},
): string {
  const f = (v: number | undefined, d = 0) => (v === undefined ? '–' : v.toFixed(d));
  const lines = [
    `level     ${monitor.levelDb.toFixed(1)} dB   peak ${monitor.peakDb.toFixed(1)} dB`,
    `hits      ${monitor.total}${monitor.model ? `   rejected ${monitor.rejected}` : ''}${strays === undefined ? '' : `   strays ${strays}`}`,
  ];
  if (songTime !== undefined)
    lines.push(`time      ${songTime.toFixed(2)} s   offset ${f(offsetMs)} ms`);
  const age = monitor.age(nowCtx);
  lines.push(
    `audio     ${age === null ? 'no data yet' : `${Math.round(age * 1000)} ms since last block`}`,
  );
  const recent = [...monitor.recent].reverse();
  if (recent.length === 0) lines.push('(no hits yet)');
  for (const h of recent) {
    const x = h.features;
    if (h.lane === ANY_LANE) {
      // a strum: the chord is what there is to show
      lines.push(
        `${h.ctxTime.toFixed(3)}s v${h.velocity.toFixed(2)} strum  chord ${h.chord ?? '–'}${h.chordScore === null ? '' : ` (${f(h.chordScore * 100)}%)`}`,
      );
      continue;
    }
    const lane = h.lane === '' ? (monitor.model ? 'UNKNOWN' : '–') : h.lane;
    const near =
      h.nearest && h.nearest !== h.lane
        ? ` (nearest ${h.nearest} d=${f(h.distance ?? undefined, 1)})`
        : h.distance === null
          ? ''
          : ` d=${f(h.distance, 1)}`;
    lines.push(
      `${h.ctxTime.toFixed(3)}s v${h.velocity.toFixed(2)} ${lane}${near}`,
      `    ${f(x['centroid'])} Hz  L${f((x['low'] ?? 0) * 100)}/M${f((x['mid'] ?? 0) * 100)}/H${f((x['high'] ?? 0) * 100)}%  decay ${f(x['decayMs'])} ms  zcr ${f(x['zcr'], 2)}  flat ${f(x['flatness'], 2)}  peak ${f(x['peakDb'], 1)} dB`,
    );
  }
  return lines.join('\n');
}
