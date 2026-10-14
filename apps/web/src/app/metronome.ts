import type { KeyValueStore } from '@lineup/core';

/** The slowest and fastest tempo, beats per minute. */
export const BPM_RANGE = { min: 20, max: 300 } as const;
/** The most beats in a bar. */
export const MAX_BEATS = 12;

/** How loud a beat is: a strong beat, a normal one, a quiet one, or none. */
export type BeatLevel = 'accent' | 'normal' | 'soft' | 'mute';
export const BEAT_LEVELS: readonly BeatLevel[] = ['accent', 'normal', 'soft', 'mute'];
/** The loudness of each level, 0..1. */
export const LEVEL_GAIN: Readonly<Record<BeatLevel, number>> = {
  accent: 1,
  normal: 0.65,
  soft: 0.32,
  mute: 0,
};

/** How each beat is divided. */
export type Subdivision = 'none' | 'eighths' | 'triplets' | 'sixteenths' | 'swing';
export const SUBDIVISIONS: readonly { id: Subdivision; label: string }[] = [
  { id: 'none', label: 'Beats only' },
  { id: 'eighths', label: 'Eighths (1 &)' },
  { id: 'triplets', label: 'Triplets (1 la li)' },
  { id: 'sixteenths', label: 'Sixteenths (1 e & a)' },
  { id: 'swing', label: 'Swing eighths' },
];

/** Where the clicks within one beat fall, as fractions of the beat. */
export const SUBDIVISION_OFFSETS: Readonly<Record<Subdivision, readonly number[]>> = {
  none: [0],
  eighths: [0, 0.5],
  triplets: [0, 1 / 3, 2 / 3],
  sixteenths: [0, 0.25, 0.5, 0.75],
  swing: [0, 2 / 3],
};

export type ClickSound = 'click' | 'wood' | 'beep' | 'hat';
export const SOUNDS: readonly { id: ClickSound; label: string }[] = [
  { id: 'click', label: 'Click' },
  { id: 'wood', label: 'Wood block' },
  { id: 'beep', label: 'Beep' },
  { id: 'hat', label: 'Hi-hat' },
];

/** Gradual tempo change: every `bars` bars add `step` bpm until `target` is reached (a speed trainer). */
export interface Trainer {
  on: boolean;
  /** Bpm added each time (negative slows down). */
  step: number;
  bars: number;
  target: number;
}

export interface MetronomeConfig {
  bpm: number;
  /** One entry per beat of the bar: its loudness. */
  pattern: BeatLevel[];
  subdivision: Subdivision;
  sound: ClickSound;
  /** 0..1 */
  volume: number;
  trainer: Trainer;
}

export const DEFAULT_CONFIG: MetronomeConfig = {
  bpm: 100,
  pattern: ['accent', 'normal', 'normal', 'normal'],
  subdivision: 'none',
  sound: 'click',
  volume: 0.8,
  trainer: { on: false, step: 5, bars: 4, target: 140 },
};

/** Keeps a tempo in range, in whole bpm. */
export const clampBpm = (bpm: number): number =>
  Number.isFinite(bpm)
    ? Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(bpm)))
    : DEFAULT_CONFIG.bpm;

const TEMPO_NAMES: readonly [number, string][] = [
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
  [Infinity, 'Prestissimo'],
];

/** The traditional Italian name for a tempo. */
export function tempoName(bpm: number): string {
  return TEMPO_NAMES.find(([limit]) => bpm < limit)![1];
}

/**
 * Sets the number of beats in a bar, keeping the loudness of the beats already there: a new beat is
 * normal, and the first beat is always an accent when the bar grows from nothing.
 */
export function resizePattern(pattern: readonly BeatLevel[], beats: number): BeatLevel[] {
  const n = Math.min(MAX_BEATS, Math.max(1, Math.round(beats)));
  return Array.from({ length: n }, (_, i) => pattern[i] ?? (i === 0 ? 'accent' : 'normal'));
}

/** The next loudness when a beat is tapped: accent, normal, soft, mute, and round again. */
export function nextLevel(level: BeatLevel): BeatLevel {
  return BEAT_LEVELS[(BEAT_LEVELS.indexOf(level) + 1) % BEAT_LEVELS.length]!;
}

/** Tap tempo: the tempo of the last few taps, forgetting a tap sequence that has gone cold. */
export class TapTempo {
  private taps: number[] = [];

  /** @param keep taps to average over; @param gap seconds of silence after which a new count starts. */
  constructor(
    private readonly keep = 6,
    private readonly gap = 2,
  ) {}

  /** Registers a tap at `at` seconds; returns the tempo so far, or null after the first tap. */
  tap(at: number): number | null {
    if (this.taps.length && at - this.taps[this.taps.length - 1]! > this.gap) this.taps = [];
    this.taps.push(at);
    if (this.taps.length > this.keep) this.taps.shift();
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1]! - this.taps[0]!;
    return clampBpm((60 * (this.taps.length - 1)) / span);
  }

  reset(): void {
    this.taps = [];
  }
}

/** One click to sound. */
export interface Click {
  /** Time on the audio clock, seconds. */
  time: number;
  /** 0..1, before the master volume. */
  gain: number;
  /** A strong beat (sounds higher and brighter). */
  accent: boolean;
  /** The beat of the bar, from 0, and the click within the beat (0 is on the beat). */
  beat: number;
  sub: number;
  /** The bar, counted from 0 since the start. */
  bar: number;
}

/** How loud the clicks between the beats are, relative to a normal beat. */
const SUB_GAIN = 0.4;

/**
 * Decides which clicks sound when, ahead of the audio clock. Call `advance` often (a timer every
 * 25 ms or so); it hands out every click that falls before `now + lookahead`, each with its own
 * time, so the audio engine places them exactly and a busy page cannot make the beat wobble. The
 * configuration is read afresh at every click: a tempo change takes effect at the next one.
 */
export class MetronomeScheduler {
  private next = 0;
  private beat = 0;
  private sub = 0;
  private bar = 0;
  private running = false;
  /** The tempo in force (the trainer moves it on from the configured one). */
  private bpm = 0;
  private barsAtBpm = 0;

  constructor(
    private readonly config: () => MetronomeConfig,
    private readonly emit: (click: Click) => void,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** The tempo being played: the configured one, or where the trainer has taken it. */
  get currentBpm(): number {
    return this.running ? this.bpm : this.config().bpm;
  }

  /** Starts with the first click at `at` (audio clock seconds). */
  start(at: number): void {
    this.running = true;
    this.next = at;
    this.beat = 0;
    this.sub = 0;
    this.bar = 0;
    this.bpm = this.config().bpm;
    this.barsAtBpm = 0;
  }

  stop(): void {
    this.running = false;
  }

  /** The configured tempo was changed by the player: the trainer starts again from it. */
  retune(): void {
    this.bpm = this.config().bpm;
    this.barsAtBpm = 0;
  }

  /** Emits every click due before `now + lookahead`. */
  advance(now: number, lookahead = 0.12): void {
    while (this.running && this.next < now + lookahead) {
      const cfg = this.config();
      const offsets = SUBDIVISION_OFFSETS[cfg.subdivision];
      const beats = cfg.pattern.length;
      if (this.beat >= beats) this.beat = 0;
      if (this.sub >= offsets.length) this.sub = 0;
      const level = cfg.pattern[this.beat] ?? 'normal';
      const onBeat = this.sub === 0;
      const gain = LEVEL_GAIN[level] * (onBeat ? 1 : SUB_GAIN);
      if (gain > 0) {
        this.emit({
          time: this.next,
          gain,
          accent: level === 'accent' && onBeat,
          beat: this.beat,
          sub: this.sub,
          bar: this.bar,
        });
      }
      // the time to the next click: the gap between this offset and the next one within the beat
      const beatSeconds = 60 / this.bpm;
      const here = offsets[this.sub]!;
      const after = this.sub + 1 < offsets.length ? offsets[this.sub + 1]! : 1;
      this.next += (after - here) * beatSeconds;
      this.sub++;
      if (this.sub >= offsets.length) {
        this.sub = 0;
        this.beat++;
        if (this.beat >= beats) {
          this.beat = 0;
          this.bar++;
          this.barsAtBpm++;
          this.train(cfg);
        }
      }
    }
  }

  /** The speed trainer: after enough bars at one tempo, move on toward the target. */
  private train(cfg: MetronomeConfig): void {
    const t = cfg.trainer;
    if (!t.on || this.barsAtBpm < Math.max(1, t.bars)) return;
    this.barsAtBpm = 0;
    const toward = t.target >= this.bpm ? 1 : -1;
    const step = Math.abs(t.step) * toward;
    const next = this.bpm + step;
    this.bpm = clampBpm(toward > 0 ? Math.min(next, t.target) : Math.max(next, t.target));
  }
}

/** A saved set-up the player can come back to. */
export interface Preset {
  name: string;
  config: MetronomeConfig;
}

const KEY = 'lineup.metronome.v1';
/** The most presets kept. */
export const MAX_PRESETS = 12;

const isLevel = (v: unknown): v is BeatLevel => BEAT_LEVELS.includes(v as BeatLevel);

/** Reads a config from untrusted data (storage, a preset), falling back to the default per field. */
export function parseConfig(raw: unknown): MetronomeConfig {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const pattern =
    Array.isArray(r['pattern']) && r['pattern'].length > 0 && r['pattern'].every(isLevel)
      ? resizePattern(r['pattern'] as BeatLevel[], r['pattern'].length)
      : [...DEFAULT_CONFIG.pattern];
  const t = (
    typeof r['trainer'] === 'object' && r['trainer'] !== null ? r['trainer'] : {}
  ) as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d;
  return {
    bpm: typeof r['bpm'] === 'number' ? clampBpm(r['bpm']) : DEFAULT_CONFIG.bpm,
    pattern,
    subdivision: SUBDIVISIONS.some((s) => s.id === r['subdivision'])
      ? (r['subdivision'] as Subdivision)
      : DEFAULT_CONFIG.subdivision,
    sound: SOUNDS.some((s) => s.id === r['sound'])
      ? (r['sound'] as ClickSound)
      : DEFAULT_CONFIG.sound,
    volume:
      typeof r['volume'] === 'number' && Number.isFinite(r['volume'])
        ? Math.min(1, Math.max(0, r['volume']))
        : DEFAULT_CONFIG.volume,
    trainer: {
      on: t['on'] === true,
      step: num(t['step'], DEFAULT_CONFIG.trainer.step, -50, 50) || DEFAULT_CONFIG.trainer.step,
      bars: num(t['bars'], DEFAULT_CONFIG.trainer.bars, 1, 32),
      target: num(t['target'], DEFAULT_CONFIG.trainer.target, BPM_RANGE.min, BPM_RANGE.max),
    },
  };
}

/** The metronome's saved set-up and presets, tolerating missing or corrupt storage. */
export class MetronomeStore {
  constructor(private readonly store: KeyValueStore | null) {}

  private read(): { config?: unknown; presets?: unknown } {
    try {
      const v: unknown = JSON.parse(this.store?.getItem(KEY) ?? 'null');
      return typeof v === 'object' && v !== null ? v : {};
    } catch {
      return {};
    }
  }

  private write(config: MetronomeConfig, presets: Preset[]): void {
    try {
      this.store?.setItem(KEY, JSON.stringify({ config, presets }));
    } catch {
      // storage blocked: the set-up lasts for this visit only
    }
  }

  config(): MetronomeConfig {
    return parseConfig(this.read().config);
  }

  presets(): Preset[] {
    const raw = this.read().presets;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p): p is { name: string; config: unknown } => typeof p?.name === 'string')
      .slice(0, MAX_PRESETS)
      .map((p) => ({ name: p.name.slice(0, 40), config: parseConfig(p.config) }));
  }

  saveConfig(config: MetronomeConfig): void {
    this.write(config, this.presets());
  }

  /** Saves a preset under `name` (replacing one of the same name); the oldest goes when full. */
  savePreset(name: string, config: MetronomeConfig): Preset[] {
    const clean = name.trim().slice(0, 40) || `${config.bpm} bpm`;
    const list = this.presets().filter((p) => p.name !== clean);
    list.push({ name: clean, config });
    const kept = list.slice(-MAX_PRESETS);
    this.write(this.config(), kept);
    return kept;
  }

  deletePreset(name: string): Preset[] {
    const kept = this.presets().filter((p) => p.name !== name);
    this.write(this.config(), kept);
    return kept;
  }
}
