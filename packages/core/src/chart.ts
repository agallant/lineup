import {
  Problems,
  at,
  isRecord,
  describeValue,
  parseJson,
  readArray,
  readEnum,
  readNumber,
  readObject,
  readString,
  warnUnknownKeys,
  type Loaded,
} from './validate';

/** Current chart format. Bump it only together with a migration. */
export const CHART_VERSION = 1;

export interface NoteExpectation {
  /** Chord name for strum modes, e.g. "C", "Am". Enforced from L5 on. */
  chord?: string;
  /** Strum direction. Enforced from L5 on. */
  direction?: 'up' | 'down';
}

/**
 * One thing to play. `t` and `duration` are seconds on the song clock
 * (song time 0 = first beat after the count-in). Pitched notes store CONCERT
 * pitch as a MIDI note number (60 = middle C, fractions allowed); percussion
 * notes store a lane id. The instrument profile maps these to what the player
 * reads or plays.
 */
export interface ChartNote {
  t: number;
  /** 0 for instantaneous hits. Sustained notes (voice, winds) use > 0. */
  duration: number;
  lane?: string;
  pitch?: number;
  expected?: NoteExpectation;
}

export interface ChartMeta {
  title: string;
  artist?: string;
  bpm: number;
  /** Beats of count-in before song time 0. */
  countInBeats: number;
  /** Optional backing audio reference (unused until audio files are supported). */
  audio?: string;
  /** Profile ids this chart is intended for, e.g. ["voice"]. */
  instruments?: string[];
}

export interface Chart {
  version: typeof CHART_VERSION;
  meta: ChartMeta;
  notes: ChartNote[];
}

const META_KEYS = ['title', 'artist', 'bpm', 'countInBeats', 'audio', 'instruments'] as const;
const NOTE_KEYS = ['t', 'duration', 'lane', 'pitch', 'expected'] as const;
const TOP_KEYS = ['version', 'meta', 'notes'] as const;

/** A migration upgrades a raw chart from version N to N+1. */
export type ChartMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** There is no older format yet: v1 is the first. Add `1: (raw) => ...` when v2 lands. */
export const CHART_MIGRATIONS: Readonly<Record<number, ChartMigration>> = {};

export function migrateChart(
  raw: Record<string, unknown>,
  migrations: Readonly<Record<number, ChartMigration>> = CHART_MIGRATIONS,
  target: number = CHART_VERSION,
): Loaded<Record<string, unknown>> {
  const version = raw['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return {
      ok: false,
      errors: [
        `version: required, expected the whole number ${target} (got ${describeValue(version)})`,
      ],
    };
  }
  if (version > target) {
    return {
      ok: false,
      errors: [
        `version: this chart is version ${version} but this app only understands up to ${target}. Update Lineup.`,
      ],
    };
  }
  let current = raw;
  for (let v = version; v < target; v++) {
    const step = migrations[v];
    if (!step) {
      return { ok: false, errors: [`version: no migration from chart version ${v} to ${v + 1}`] };
    }
    current = { ...step(current), version: v + 1 };
  }
  return {
    ok: true,
    value: current,
    warnings: version < target ? [`upgraded from version ${version}`] : [],
  };
}

/** Validates (and migrates) an already-parsed chart object. */
export function loadChart(input: unknown): Loaded<Chart> {
  if (!isRecord(input)) {
    return { ok: false, errors: [`a chart must be an object (got ${describeValue(input)})`] };
  }
  const migrated = migrateChart(input);
  if (!migrated.ok) return migrated;
  const raw = migrated.value;

  const p = new Problems();
  p.warnings.push(...migrated.warnings);
  warnUnknownKeys(raw, TOP_KEYS, '', p);

  // ---- meta
  const metaRaw = readObject(raw, 'meta', '', p, { required: true });
  let meta: ChartMeta | undefined;
  if (metaRaw) {
    warnUnknownKeys(metaRaw, META_KEYS, 'meta', p);
    const title = readString(metaRaw, 'title', 'meta', p, { required: true, maxLength: 80 });
    const bpm = readNumber(metaRaw, 'bpm', 'meta', p, { required: true, min: 20, max: 400 });
    const countInBeats = readNumber(metaRaw, 'countInBeats', 'meta', p, {
      min: 0,
      max: 16,
      integer: true,
    });
    const artist = readString(metaRaw, 'artist', 'meta', p, { maxLength: 80 });
    const audio = readString(metaRaw, 'audio', 'meta', p);
    let instruments: string[] | undefined;
    const instrumentsRaw = readArray(metaRaw, 'instruments', 'meta', p);
    if (instrumentsRaw) {
      instruments = [];
      instrumentsRaw.forEach((v, i) => {
        if (typeof v === 'string' && v.trim() !== '') instruments!.push(v);
        else
          p.error(
            at('meta.instruments', i),
            `expected a profile id like "voice" (got ${describeValue(v)})`,
          );
      });
    }
    if (title !== undefined && bpm !== undefined) {
      meta = { title, bpm, countInBeats: countInBeats ?? 4 };
      if (artist !== undefined) meta.artist = artist;
      if (audio !== undefined) meta.audio = audio;
      if (instruments !== undefined) meta.instruments = instruments;
    }
  }

  // ---- notes
  const notesRaw = readArray(raw, 'notes', '', p, { required: true, minLength: 1 });
  const notes: ChartNote[] = [];
  if (notesRaw) {
    notesRaw.forEach((n, i) => {
      const here = at('notes', i);
      if (!isRecord(n)) {
        p.error(here, `expected an object like {"t": 1.5} (got ${describeValue(n)})`);
        return;
      }
      warnUnknownKeys(n, NOTE_KEYS, here, p);
      const t = readNumber(n, 't', here, p, { required: true, min: 0 });
      const duration = readNumber(n, 'duration', here, p, { min: 0 });
      const lane = readString(n, 'lane', here, p, { maxLength: 32 });
      const pitch = readNumber(n, 'pitch', here, p, { min: 0, max: 127 });
      const expectedRaw = readObject(n, 'expected', here, p);
      let expected: NoteExpectation | undefined;
      if (expectedRaw) {
        warnUnknownKeys(expectedRaw, ['chord', 'direction'], `${here}.expected`, p);
        const chord = readString(expectedRaw, 'chord', `${here}.expected`, p, { maxLength: 16 });
        const direction = readEnum(expectedRaw, 'direction', `${here}.expected`, p, ['up', 'down']);
        expected = {};
        if (chord !== undefined) expected.chord = chord;
        if (direction !== undefined) expected.direction = direction;
      }
      if (t === undefined) return;
      const note: ChartNote = { t, duration: duration ?? 0 };
      if (lane !== undefined) note.lane = lane;
      if (pitch !== undefined) note.pitch = pitch;
      if (expected !== undefined) note.expected = expected;
      notes.push(note);
    });
  }

  if (!p.ok) return { ok: false, errors: p.report() };
  if (!meta) throw new Error('unreachable: meta is set whenever validation passes');

  // Time order matters to the judge, so sort (stable) rather than reject.
  let sorted = true;
  for (let i = 1; i < notes.length; i++) if (notes[i]!.t < notes[i - 1]!.t) sorted = false;
  if (!sorted) {
    notes.sort((a, b) => a.t - b.t);
    p.warn('notes', 'were not in time order, so they were sorted');
  }
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1]!;
    const b = notes[i]!;
    if (b.t - a.t < 0.001 && a.lane === b.lane && a.pitch === b.pitch) {
      p.warn(at('notes', i), `duplicates the note before it (same time, lane and pitch)`);
    }
  }

  return p.result<Chart>({ version: CHART_VERSION, meta, notes });
}

/** Parses JSON text, then validates. */
export function parseChart(text: string): Loaded<Chart> {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return loadChart(parsed.value);
}

// ---- authoring helpers --------------------------------------------------

export interface BeatNote {
  /** Position in beats from song time 0. */
  beat: number;
  /** Length in beats (default 0 = instantaneous). */
  beats?: number;
  lane?: string;
  pitch?: number;
  expected?: NoteExpectation;
}

/** Builds a chart from beat positions (easier to hand-write than seconds). */
export function chartFromBeats(
  meta: Pick<ChartMeta, 'title' | 'bpm'> & Partial<ChartMeta>,
  beatNotes: readonly BeatNote[],
): Chart {
  const spb = 60 / meta.bpm;
  const notes: ChartNote[] = beatNotes.map((b) => {
    const n: ChartNote = { t: round6(b.beat * spb), duration: round6((b.beats ?? 0) * spb) };
    if (b.lane !== undefined) n.lane = b.lane;
    if (b.pitch !== undefined) n.pitch = b.pitch;
    if (b.expected !== undefined) n.expected = b.expected;
    return n;
  });
  const result = loadChart({
    version: CHART_VERSION,
    meta: { countInBeats: 4, ...meta },
    notes,
  });
  if (!result.ok)
    throw new Error(`chartFromBeats produced an invalid chart:\n${result.errors.join('\n')}`);
  return result.value;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Shifts every pitched note by `semitones` (a key change). Returns a new chart. */
export function transposeChart(chart: Chart, semitones: number): Chart {
  return {
    ...chart,
    notes: chart.notes.map((n) =>
      n.pitch === undefined ? n : { ...n, pitch: n.pitch + semitones },
    ),
  };
}

/**
 * Plays the chart at `speed` times its tempo (0.5 = half speed, for practice): every time and
 * duration is divided by it and the bpm is multiplied. Returns a new chart.
 */
export function rescaleChart(chart: Chart, speed: number): Chart {
  if (!(speed > 0) || !Number.isFinite(speed))
    throw new Error(`speed must be positive (got ${speed})`);
  if (speed === 1) return chart;
  return {
    ...chart,
    meta: { ...chart.meta, bpm: round6(chart.meta.bpm * speed) },
    notes: chart.notes.map((n) => ({
      ...n,
      t: round6(n.t / speed),
      duration: round6(n.duration / speed),
    })),
  };
}

/** Lowest and highest concert pitch in the chart, or null if it has no pitched notes. */
export function chartPitchRange(chart: Chart): { low: number; high: number } | null {
  let low = Infinity;
  let high = -Infinity;
  for (const n of chart.notes) {
    if (n.pitch === undefined) continue;
    low = Math.min(low, n.pitch);
    high = Math.max(high, n.pitch);
  }
  return low <= high ? { low, high } : null;
}

/** Song time at which the last note ends. */
export function chartEnd(chart: Chart): number {
  return chart.notes.reduce((end, n) => Math.max(end, n.t + n.duration), 0);
}

/**
 * Index of the note being played at song time `t` (inside [t0, t0+duration),
 * with `slack` seconds of grace before it so the UI can prepare), or null.
 * Notes are time-sorted; if several overlap the earliest-starting one wins.
 */
export function activeNoteIndex(chart: Pick<Chart, 'notes'>, t: number, slack = 0): number | null {
  for (let i = 0; i < chart.notes.length; i++) {
    const n = chart.notes[i]!;
    if (n.t - slack > t) return null; // sorted: nothing later can be active
    if (t < n.t + Math.max(n.duration, 0.2)) return i;
  }
  return null;
}
