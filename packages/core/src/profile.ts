import {
  Problems,
  at,
  describeValue,
  isRecord,
  readArray,
  readBoolean,
  readEnum,
  readNumber,
  readObject,
  readString,
  warnUnknownKeys,
  type Loaded,
} from './validate';

export const MODES = ['strumline', 'singline', 'windline', 'beatline'] as const;
export type Mode = (typeof MODES)[number];

/** What the detectors should produce for this instrument. */
export const INPUT_KINDS = ['pitch', 'onset', 'percussion', 'strum'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export const RENDERER_KINDS = ['lane-highway', 'pitch-highway', 'percussion-lanes'] as const;
export type RendererKind = (typeof RENDERER_KINDS)[number];

export const JUDGE_STRATEGIES = ['discrete', 'continuous'] as const;
export type JudgeStrategy = (typeof JUDGE_STRATEGIES)[number];

export interface Lane {
  id: string;
  label: string;
  /** CSS colour. */
  color: string;
  /** Percussion: the timbre class whose sound lands in this lane. */
  timbre?: string;
}

/** A sound the percussion classifier learns during enrollment. */
export interface TimbreClass {
  id: string;
  label: string;
  /** Instruction shown during enrollment, e.g. "Clap". */
  prompt: string;
}

export interface TuningString {
  label: string;
  /** Concert pitch of the open string, MIDI. */
  midi: number;
}

export interface OnsetSettings {
  /** Required rise (dB) over the quietest recent frame. */
  riseDb: number;
  refractoryMs: number;
  lookbackMs: number;
  minLevelDb: number;
}

export interface DetectorSettings {
  /** Pitch analysis window in samples (power of two). */
  windowSize: number;
  /** Samples between pitch estimates. */
  hopSize: number;
  /** Minimum McLeod clarity (0..1) to accept a pitch. */
  clarityThreshold: number;
  /** Window RMS below this (dBFS) reports no pitch. */
  minLevelDb: number;
  minHz: number;
  maxHz: number;
  /**
   * How long a new pitch must persist before it counts as a new note
   * (Windline segmentation, used from L3). 0 disables the gate.
   */
  stabilityGateMs: number;
  /** Shift out-of-range detections by octaves into [minHz, maxHz] instead of dropping them (voice). */
  foldIntoRange: boolean;
  onset: OnsetSettings;
}

export interface PitchJudgeSettings {
  /** A frame counts as correct within this many cents of the target. */
  toleranceCents: number;
  /** Accept the right pitch class in any octave (voice). */
  octaveForgiving: boolean;
  /** Average pitch over this long before comparing, so vibrato does not count against you. 0 = off. */
  vibratoSmoothingMs: number;
  /** Fraction of the sustain that must be on pitch for a "good". */
  coverageGood: number;
  /** Fraction of the sustain that must be on pitch for a "perfect". */
  coveragePerfect: number;
}

export interface JudgmentSettings {
  strategy: JudgeStrategy;
  timing: { perfectMs: number; goodMs: number };
  pitch?: PitchJudgeSettings;
  /** What an input must match, besides timing, for a note to be hit. */
  match: {
    lane: boolean;
    pitch: boolean;
    chord: boolean;
    laneStrict?: boolean;
    chordStrict?: boolean;
  };
}

export interface InstrumentProfile {
  id: string;
  name: string;
  mode: Mode;
  input: InputKind;
  renderer: RendererKind;
  /** Concert-pitch range the instrument (or voice) can produce, MIDI. */
  range?: { lowMidi: number; highMidi: number };
  /**
   * Written vs sounding pitch. written = sounding + writtenMinusSounding.
   * 0 for C instruments. Charts always store sounding (concert) pitch.
   */
  transposition?: { writtenMinusSounding: number };
  tuning?: { name: string; reentrant: boolean; strings: TuningString[] };
  lanes?: Lane[];
  timbreClasses?: TimbreClass[];
  detector: DetectorSettings;
  judgment: JudgmentSettings;
}

const PROFILE_KEYS = [
  'id',
  'name',
  'mode',
  'input',
  'renderer',
  'range',
  'transposition',
  'tuning',
  'lanes',
  'timbreClasses',
  'detector',
  'judgment',
] as const;

export function loadProfile(input: unknown): Loaded<InstrumentProfile> {
  if (!isRecord(input)) {
    return { ok: false, errors: [`a profile must be an object (got ${describeValue(input)})`] };
  }
  const p = new Problems();
  warnUnknownKeys(input, PROFILE_KEYS, '', p);

  const id = readString(input, 'id', '', p, { required: true, maxLength: 40 });
  if (id !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    p.error('id', `expected lowercase letters, digits and dashes (got ${describeValue(id)})`);
  }
  const name = readString(input, 'name', '', p, { required: true, maxLength: 60 });
  const mode = readEnum(input, 'mode', '', p, MODES, { required: true });
  const kind = readEnum(input, 'input', '', p, INPUT_KINDS, { required: true });
  const renderer = readEnum(input, 'renderer', '', p, RENDERER_KINDS, { required: true });

  // ---- optional pitch info
  let range: InstrumentProfile['range'];
  const rangeRaw = readObject(input, 'range', '', p);
  if (rangeRaw) {
    const lowMidi = readNumber(rangeRaw, 'lowMidi', 'range', p, {
      required: true,
      min: 0,
      max: 127,
    });
    const highMidi = readNumber(rangeRaw, 'highMidi', 'range', p, {
      required: true,
      min: 0,
      max: 127,
    });
    if (lowMidi !== undefined && highMidi !== undefined) {
      if (lowMidi >= highMidi)
        p.error('range', `lowMidi (${lowMidi}) must be below highMidi (${highMidi})`);
      else range = { lowMidi, highMidi };
    }
  }

  let transposition: InstrumentProfile['transposition'];
  const transRaw = readObject(input, 'transposition', '', p);
  if (transRaw) {
    const v = readNumber(transRaw, 'writtenMinusSounding', 'transposition', p, {
      required: true,
      min: -36,
      max: 36,
      integer: true,
    });
    if (v !== undefined) transposition = { writtenMinusSounding: v };
  }

  let tuning: InstrumentProfile['tuning'];
  const tuningRaw = readObject(input, 'tuning', '', p);
  if (tuningRaw) {
    const tName = readString(tuningRaw, 'name', 'tuning', p, { required: true });
    const reentrant = readBoolean(tuningRaw, 'reentrant', 'tuning', p) ?? false;
    const stringsRaw = readArray(tuningRaw, 'strings', 'tuning', p, {
      required: true,
      minLength: 1,
    });
    const strings: TuningString[] = [];
    stringsRaw?.forEach((s, i) => {
      const here = at('tuning.strings', i);
      if (!isRecord(s)) return p.error(here, `expected an object (got ${describeValue(s)})`);
      const label = readString(s, 'label', here, p, { required: true });
      const midi = readNumber(s, 'midi', here, p, { required: true, min: 0, max: 127 });
      if (label !== undefined && midi !== undefined) strings.push({ label, midi });
    });
    if (tName !== undefined && stringsRaw) tuning = { name: tName, reentrant, strings };
  }

  // ---- lanes and timbre classes
  let lanes: Lane[] | undefined;
  const lanesRaw = readArray(input, 'lanes', '', p, { minLength: 1 });
  if (lanesRaw) {
    lanes = [];
    const seen = new Set<string>();
    lanesRaw.forEach((l, i) => {
      const here = at('lanes', i);
      if (!isRecord(l)) return p.error(here, `expected an object (got ${describeValue(l)})`);
      warnUnknownKeys(l, ['id', 'label', 'color', 'timbre'], here, p);
      const laneId = readString(l, 'id', here, p, { required: true, maxLength: 32 });
      const label = readString(l, 'label', here, p, { required: true, maxLength: 24 });
      const color = readString(l, 'color', here, p, { required: true, maxLength: 32 });
      const timbre = readString(l, 'timbre', here, p, { maxLength: 32 });
      if (laneId !== undefined) {
        if (seen.has(laneId)) p.error(here, `lane id ${describeValue(laneId)} is used twice`);
        seen.add(laneId);
      }
      if (laneId !== undefined && label !== undefined && color !== undefined) {
        const lane: Lane = { id: laneId, label, color };
        if (timbre !== undefined) lane.timbre = timbre;
        lanes!.push(lane);
      }
    });
  }

  let timbreClasses: TimbreClass[] | undefined;
  const timbreRaw = readArray(input, 'timbreClasses', '', p, { minLength: 1 });
  if (timbreRaw) {
    timbreClasses = [];
    const seen = new Set<string>();
    timbreRaw.forEach((t, i) => {
      const here = at('timbreClasses', i);
      if (!isRecord(t)) return p.error(here, `expected an object (got ${describeValue(t)})`);
      const tid = readString(t, 'id', here, p, { required: true, maxLength: 32 });
      const label = readString(t, 'label', here, p, { required: true, maxLength: 24 });
      const prompt = readString(t, 'prompt', here, p, { required: true, maxLength: 60 });
      if (tid !== undefined) {
        if (seen.has(tid)) p.error(here, `timbre class id ${describeValue(tid)} is used twice`);
        seen.add(tid);
      }
      if (tid !== undefined && label !== undefined && prompt !== undefined) {
        timbreClasses!.push({ id: tid, label, prompt });
      }
    });
  }
  if (lanes && timbreClasses) {
    const known = new Set(timbreClasses.map((t) => t.id));
    lanes.forEach((l, i) => {
      if (l.timbre !== undefined && !known.has(l.timbre)) {
        p.error(at('lanes', i), `timbre ${describeValue(l.timbre)} is not in timbreClasses`);
      }
    });
  }

  // ---- detector
  let detector: DetectorSettings | undefined;
  const detRaw = readObject(input, 'detector', '', p, { required: true });
  if (detRaw) {
    warnUnknownKeys(
      detRaw,
      [
        'windowSize',
        'hopSize',
        'clarityThreshold',
        'minLevelDb',
        'minHz',
        'maxHz',
        'stabilityGateMs',
        'foldIntoRange',
        'onset',
      ],
      'detector',
      p,
    );
    const windowSize = readNumber(detRaw, 'windowSize', 'detector', p, {
      required: true,
      min: 256,
      max: 16384,
      integer: true,
    });
    if (windowSize !== undefined && (windowSize & (windowSize - 1)) !== 0) {
      p.error('detector.windowSize', `expected a power of two (got ${windowSize})`);
    }
    const hopSize = readNumber(detRaw, 'hopSize', 'detector', p, {
      required: true,
      min: 64,
      max: 8192,
      integer: true,
    });
    const clarityThreshold = readNumber(detRaw, 'clarityThreshold', 'detector', p, {
      required: true,
      min: 0,
      max: 1,
    });
    const minLevelDb = readNumber(detRaw, 'minLevelDb', 'detector', p, {
      required: true,
      min: -120,
      max: 0,
    });
    const minHz = readNumber(detRaw, 'minHz', 'detector', p, {
      required: true,
      min: 20,
      max: 5000,
    });
    const maxHz = readNumber(detRaw, 'maxHz', 'detector', p, {
      required: true,
      min: 20,
      max: 8000,
    });
    if (minHz !== undefined && maxHz !== undefined && minHz >= maxHz) {
      p.error('detector', `minHz (${minHz}) must be below maxHz (${maxHz})`);
    }
    const stabilityGateMs = readNumber(detRaw, 'stabilityGateMs', 'detector', p, {
      required: true,
      min: 0,
      max: 500,
    });
    const foldIntoRange = readBoolean(detRaw, 'foldIntoRange', 'detector', p) ?? false;
    let onset: OnsetSettings | undefined;
    const onsetRaw = readObject(detRaw, 'onset', 'detector', p, { required: true });
    if (onsetRaw) {
      const riseDb = readNumber(onsetRaw, 'riseDb', 'detector.onset', p, {
        required: true,
        min: 1,
        max: 40,
      });
      const refractoryMs = readNumber(onsetRaw, 'refractoryMs', 'detector.onset', p, {
        required: true,
        min: 5,
        max: 1000,
      });
      const lookbackMs = readNumber(onsetRaw, 'lookbackMs', 'detector.onset', p, {
        required: true,
        min: 5,
        max: 500,
      });
      const onsetMin = readNumber(onsetRaw, 'minLevelDb', 'detector.onset', p, {
        required: true,
        min: -120,
        max: 0,
      });
      if (
        riseDb !== undefined &&
        refractoryMs !== undefined &&
        lookbackMs !== undefined &&
        onsetMin !== undefined
      ) {
        onset = { riseDb, refractoryMs, lookbackMs, minLevelDb: onsetMin };
      }
    }
    if (
      windowSize !== undefined &&
      hopSize !== undefined &&
      clarityThreshold !== undefined &&
      minLevelDb !== undefined &&
      minHz !== undefined &&
      maxHz !== undefined &&
      stabilityGateMs !== undefined &&
      onset !== undefined
    ) {
      if (hopSize > windowSize)
        p.error('detector.hopSize', `must not exceed windowSize (${windowSize})`);
      detector = {
        windowSize,
        hopSize,
        clarityThreshold,
        minLevelDb,
        minHz,
        maxHz,
        stabilityGateMs,
        foldIntoRange,
        onset,
      };
    }
  }

  // ---- judgment
  let judgment: JudgmentSettings | undefined;
  const judgeRaw = readObject(input, 'judgment', '', p, { required: true });
  if (judgeRaw) {
    warnUnknownKeys(judgeRaw, ['strategy', 'timing', 'pitch', 'match'], 'judgment', p);
    const strategy = readEnum(judgeRaw, 'strategy', 'judgment', p, JUDGE_STRATEGIES, {
      required: true,
    });
    let timing: JudgmentSettings['timing'] | undefined;
    const timingRaw = readObject(judgeRaw, 'timing', 'judgment', p, { required: true });
    if (timingRaw) {
      const perfectMs = readNumber(timingRaw, 'perfectMs', 'judgment.timing', p, {
        required: true,
        min: 1,
        max: 2000,
      });
      const goodMs = readNumber(timingRaw, 'goodMs', 'judgment.timing', p, {
        required: true,
        min: 1,
        max: 2000,
      });
      if (perfectMs !== undefined && goodMs !== undefined) {
        if (perfectMs > goodMs)
          p.error('judgment.timing', `perfectMs (${perfectMs}) must not exceed goodMs (${goodMs})`);
        else timing = { perfectMs, goodMs };
      }
    }
    let pitch: PitchJudgeSettings | undefined;
    const pitchRaw = readObject(judgeRaw, 'pitch', 'judgment', p);
    if (pitchRaw) {
      const toleranceCents = readNumber(pitchRaw, 'toleranceCents', 'judgment.pitch', p, {
        required: true,
        min: 5,
        max: 600,
      });
      const octaveForgiving = readBoolean(pitchRaw, 'octaveForgiving', 'judgment.pitch', p, {
        required: true,
      });
      const vibratoSmoothingMs = readNumber(pitchRaw, 'vibratoSmoothingMs', 'judgment.pitch', p, {
        required: true,
        min: 0,
        max: 1000,
      });
      const coverageGood = readNumber(pitchRaw, 'coverageGood', 'judgment.pitch', p, {
        required: true,
        min: 0,
        max: 1,
      });
      const coveragePerfect = readNumber(pitchRaw, 'coveragePerfect', 'judgment.pitch', p, {
        required: true,
        min: 0,
        max: 1,
      });
      if (
        toleranceCents !== undefined &&
        octaveForgiving !== undefined &&
        vibratoSmoothingMs !== undefined &&
        coverageGood !== undefined &&
        coveragePerfect !== undefined
      ) {
        if (coverageGood > coveragePerfect) {
          p.error(
            'judgment.pitch',
            `coverageGood (${coverageGood}) must not exceed coveragePerfect (${coveragePerfect})`,
          );
        } else {
          pitch = {
            toleranceCents,
            octaveForgiving,
            vibratoSmoothingMs,
            coverageGood,
            coveragePerfect,
          };
        }
      }
    }
    let match: JudgmentSettings['match'] | undefined;
    const matchRaw = readObject(judgeRaw, 'match', 'judgment', p, { required: true });
    if (matchRaw) {
      const lane = readBoolean(matchRaw, 'lane', 'judgment.match', p, { required: true });
      const pitchMatch = readBoolean(matchRaw, 'pitch', 'judgment.match', p, { required: true });
      const chord = readBoolean(matchRaw, 'chord', 'judgment.match', p, { required: true });
      const laneStrict = readBoolean(matchRaw, 'laneStrict', 'judgment.match', p);
      const chordStrict = readBoolean(matchRaw, 'chordStrict', 'judgment.match', p);
      if (lane !== undefined && pitchMatch !== undefined && chord !== undefined) {
        match = { lane, pitch: pitchMatch, chord };
        if (laneStrict !== undefined) match.laneStrict = laneStrict;
        if (chordStrict !== undefined) match.chordStrict = chordStrict;
      }
    }
    if (strategy === 'continuous' && !pitchRaw) {
      p.error('judgment.pitch', 'required when strategy is "continuous"');
    }
    if (strategy !== undefined && timing && match) {
      judgment = { strategy, timing, match };
      if (pitch) judgment.pitch = pitch;
    }
  }

  // ---- cross-field rules
  if (renderer === 'lane-highway' && !lanes && !tuning) {
    p.error(
      'lanes',
      'required for the lane-highway renderer (or give a tuning to derive string lanes)',
    );
  }
  if (renderer === 'percussion-lanes' && !lanes)
    p.error('lanes', 'required for the percussion-lanes renderer');
  if (kind === 'pitch' && !range) p.error('range', 'required for pitch input');
  if (kind === 'percussion' && !timbreClasses)
    p.error('timbreClasses', 'required for percussion input');
  if (judgment?.match.pitch && kind !== 'pitch') {
    p.error('judgment.match.pitch', 'only valid for pitch input');
  }
  if (judgment?.match.chordStrict && !judgment.match.chord) {
    p.error('judgment.match.chordStrict', 'needs judgment.match.chord to be true');
  }
  if (judgment?.match.laneStrict && !judgment.match.lane) {
    p.error('judgment.match.laneStrict', 'needs judgment.match.lane to be true');
  }

  if (!p.ok) return { ok: false, errors: p.report() };
  if (
    id === undefined ||
    name === undefined ||
    !mode ||
    !kind ||
    !renderer ||
    !detector ||
    !judgment
  ) {
    throw new Error('unreachable: all required fields are set whenever validation passes');
  }
  const profile: InstrumentProfile = { id, name, mode, input: kind, renderer, detector, judgment };
  if (range) profile.range = range;
  if (transposition) profile.transposition = transposition;
  if (tuning) profile.tuning = tuning;
  if (lanes) profile.lanes = lanes;
  if (timbreClasses) profile.timbreClasses = timbreClasses;
  return { ok: true, value: profile, warnings: p.warnings };
}

// ---- helpers --------------------------------------------------------------

/** The pitch the player reads for a given sounding (concert) pitch. */
export function writtenMidi(profile: InstrumentProfile, concertMidi: number): number {
  return concertMidi + (profile.transposition?.writtenMinusSounding ?? 0);
}

/** Lane for a timbre class (percussion), or undefined. */
export function laneForTimbre(profile: InstrumentProfile, timbre: string): Lane | undefined {
  return profile.lanes?.find((l) => l.timbre === timbre);
}

export interface TabPosition {
  /** Index into profile.tuning.strings. */
  stringIndex: number;
  fret: number;
}

/**
 * Where to play a note on a fretted instrument: the string with the lowest
 * fret that reaches it (re-entrant tuning gives several options). Null when
 * the pitch is out of reach within `maxFret`.
 */
export function tabForPitch(
  profile: InstrumentProfile,
  concertMidi: number,
  maxFret = 12,
): TabPosition | null {
  const strings = profile.tuning?.strings;
  if (!strings) return null;
  let best: TabPosition | null = null;
  strings.forEach((s, stringIndex) => {
    const fret = Math.round(concertMidi) - s.midi;
    if (fret < 0 || fret > maxFret) return;
    if (best === null || fret < best.fret) best = { stringIndex, fret };
  });
  return best;
}
