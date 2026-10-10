import { powerSpectrum } from './fft';

/** Chord name -> the MIDI notes the four strings sound (open strings plus frets). */
export type ChordShapes = Readonly<Record<string, readonly number[]>>;

/** Samples analysed per chord decision (about 0.17 s at 48 kHz: enough to resolve a semitone near C4). */
export const CHORD_WINDOW = 8192;

/** Lowest and highest frequency used, Hz: above the lowest ukulele fundamental, below where partials are mush. */
const LOW_HZ = 200;
const HIGH_HZ = 2600;

/** Partials counted in a template; partial k gets amplitude k^-PARTIAL_DECAY. */
const PARTIALS = 6;
const PARTIAL_DECAY = 0.5;

/**
 * Spectral power is raised to this before folding into pitch classes. Strong
 * compression (power 0.3, about magnitude 0.6) keeps one loud string from
 * drowning a quiet one, which is what tells E from D in Em versus G. Chosen
 * by sweeping it against all twelve chords and several four-chord sets.
 */
const COMPRESSION = 0.3;

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** Adds `weight` to the pitch class of a (fractional) MIDI pitch, tapering to nothing half a semitone away. */
function addPitch(chroma: Float64Array, midi: number, weight: number): void {
  const nearest = Math.round(midi);
  const dev = Math.abs(midi - nearest);
  if (dev >= 0.5) return;
  chroma[mod12(nearest)]! += weight * (1 - 2 * dev);
}

function normalise(v: Float64Array): Float64Array {
  let sq = 0;
  for (const x of v) sq += x * x;
  const n = Math.sqrt(sq);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

/**
 * What a chord should look like in a 12-bin pitch-class profile: each string's
 * fundamental plus its first partials (the 3rd partial lands a fifth up, the
 * 5th a major third up), so a chord's template includes the notes its own
 * overtones add.
 */
export function chordTemplate(midis: readonly number[]): Float64Array {
  const t = new Float64Array(12);
  for (const m of midis) {
    for (let k = 1; k <= PARTIALS; k++) addPitch(t, m + 12 * Math.log2(k), k ** -PARTIAL_DECAY);
  }
  return normalise(t);
}

/**
 * Pitch-class profile of a block of audio: spectral power (compressed, so one
 * loud string does not drown the rest) folded onto 12 pitch classes,
 * counting only bins that sit close to a semitone centre.
 */
export function chordChroma(samples: ArrayLike<number>, sampleRate: number): Float64Array {
  const power = powerSpectrum(samples, CHORD_WINDOW);
  const chroma = new Float64Array(12);
  const hzPerBin = sampleRate / CHORD_WINDOW;
  const lo = Math.ceil(LOW_HZ / hzPerBin);
  const hi = Math.min(power.length - 1, Math.floor(HIGH_HZ / hzPerBin));
  for (let k = lo; k <= hi; k++) {
    const mag = power[k]! ** COMPRESSION;
    if (mag <= 0) continue;
    addPitch(chroma, 69 + 12 * Math.log2((k * hzPerBin) / 440), mag);
  }
  return normalise(chroma);
}

export interface ChordMatch {
  /** The best-fitting candidate. */
  chord: string;
  /** Cosine similarity of its template with the audio's profile, 0..1. */
  score: number;
  /** How far ahead of the runner-up it is (0 with a single candidate: then only `score` speaks). */
  margin: number;
  /** Every candidate, best first. */
  ranked: { chord: string; score: number }[];
}

export interface ChordRecognizerOptions {
  /** Below this similarity nothing is reported (silence, noise, an unrelated sound). */
  minScore?: number;
  /** The best must beat the runner-up by at least this much, or nothing is reported. */
  minMargin?: number;
}

/**
 * Closed-set chord recognition: given the few chords a song uses (say C, Am,
 * F, G), say which one a strum is, or that it is none of them. Picking among
 * four candidates is far more reliable than naming any chord from scratch.
 */
export class ChordRecognizer {
  private readonly templates: { chord: string; template: Float64Array }[];
  private readonly minScore: number;
  private readonly minMargin: number;

  constructor(
    shapes: ChordShapes,
    private readonly sampleRate: number,
    { minScore = 0.7, minMargin = 0.015 }: ChordRecognizerOptions = {},
  ) {
    this.templates = Object.entries(shapes).map(([chord, midis]) => ({
      chord,
      template: chordTemplate(midis),
    }));
    if (this.templates.length === 0) throw new Error('ChordRecognizer needs at least one chord');
    this.minScore = minScore;
    this.minMargin = minMargin;
  }

  /** Scores every candidate against the audio, without applying the acceptance thresholds. */
  rank(samples: ArrayLike<number>): { chord: string; score: number }[] {
    const chroma = chordChroma(samples, this.sampleRate);
    return this.templates
      .map(({ chord, template }) => {
        let dot = 0;
        for (let i = 0; i < 12; i++) dot += chroma[i]! * template[i]!;
        return { chord, score: dot };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * The recognised chord, or null when nothing fits well enough or two fit about equally. */
  recognize(samples: ArrayLike<number>): ChordMatch | null {
    const ranked = this.rank(samples);
    const best = ranked[0]!;
    const margin = ranked.length > 1 ? best.score - ranked[1]!.score : 0;
    if (best.score < this.minScore || (ranked.length > 1 && margin < this.minMargin)) return null;
    return { chord: best.chord, score: best.score, margin, ranked };
  }
}
