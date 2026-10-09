import {
  UKE_CHORDS,
  midiToHz,
  ukeNote,
  ukeStrum,
  voiceNote,
  windNote,
  type HitOptions,
  type MelodyOptions,
  type WindOptions,
} from '@lineup/testkit';
import type { Performer } from './performance';

/** Strums the chord named in `note.expected.chord` (default C), in the stroke direction of `note.lane`/`expected`. */
export const ukuleleStrumPerformer: Performer = (note, index, sampleRate) => {
  const chord = note.expected?.chord ?? 'C';
  const frets = UKE_CHORDS[chord] ?? UKE_CHORDS['C']!;
  const direction = note.expected?.direction ?? (note.lane === 'up' ? 'up' : 'down');
  return ukeStrum(frets, sampleRate, { direction, seed: 100 + index });
};

/**
 * Plucks a single note at `note.pitch`. Notes ring for `ring` seconds
 * (default 0.45) like a damped melody; see the known-limitation test in
 * @lineup/input for what overlapping rings do to pitch tracking.
 */
export function ukuleleNotePerformer(ring = 0.45): Performer {
  return (note, index, sampleRate) => {
    if (note.pitch === undefined) return null;
    return ukeNote(note.pitch, sampleRate, { seed: 200 + index, duration: ring });
  };
}

export interface VoicePerformerOptions extends MelodyOptions {
  /** Semitones added to every note (-12: a man singing a woman's key an octave down). */
  octaveShift?: number;
  /** Constant detune, cents. */
  detuneCents?: number;
  /** Random per-note detune, cents (standard deviation). */
  detuneSigma?: number;
  /** Per-note pitch error added on top (indexed), e.g. wrong notes. */
  semitoneErrors?: ReadonlyMap<number, number>;
}

/** A synthetic singer: sustained vowel at the note's pitch (+ shifts, errors, scoops, vibrato...). */
export function voicePerformer({
  octaveShift = 0,
  detuneCents = 0,
  detuneSigma = 0,
  semitoneErrors,
  ...melody
}: VoicePerformerOptions = {}): Performer {
  return (note, index, sampleRate, random) => {
    if (note.pitch === undefined) return null;
    const detune = detuneCents + detuneSigma * random();
    const midi = note.pitch + octaveShift + (semitoneErrors?.get(index) ?? 0) + detune / 100;
    return voiceNote(midiToHz(midi), Math.max(note.duration, 0.2), sampleRate, {
      seed: 300 + index,
      ...melody,
    });
  };
}

export interface WindPerformerOptions extends WindOptions {
  /** Semitones added to every note (12: the player overblew into the next octave). */
  octaveShift?: number;
  /** Constant detune, cents. */
  detuneCents?: number;
  /** Random per-note detune, cents (standard deviation-ish: uniform in +/- this). */
  detuneSigma?: number;
  /** Per-note pitch error added on top (indexed), e.g. wrong notes. */
  semitoneErrors?: ReadonlyMap<number, number>;
}

/** A synthetic whistle / recorder / ocarina player: one steady breath-driven tone per note. */
export function windPerformer({
  octaveShift = 0,
  detuneCents = 0,
  detuneSigma = 0,
  semitoneErrors,
  ...tone
}: WindPerformerOptions = {}): Performer {
  return (note, index, sampleRate, random) => {
    if (note.pitch === undefined) return null;
    const detune = detuneCents + detuneSigma * random();
    const midi = note.pitch + octaveShift + (semitoneErrors?.get(index) ?? 0) + detune / 100;
    return windNote(midiToHz(midi), Math.max(note.duration, 0.2), sampleRate, {
      seed: 700 + index,
      ...tone,
    });
  };
}

/** A synthetic percussion sound (clap, tap, kick...), as exported by @lineup/testkit. */
export type HitSound = (sampleRate: number, options: HitOptions) => Float32Array;

export interface PercussionPerformerOptions {
  /** Hit loudness: a multiplier on each sound's natural level, or a function of the note index. */
  gain?: number | ((index: number) => number);
  /** Per-hit variation of tone and decay (0..1). */
  variation?: number;
}

/** Plays each note with the sound registered for its lane; lanes without a sound stay silent. */
export function percussionPerformer(
  sounds: Readonly<Record<string, HitSound>>,
  { gain = 1, variation = 0.15 }: PercussionPerformerOptions = {},
): Performer {
  return (note, index, sampleRate) => {
    const sound = sounds[note.lane ?? ''];
    if (!sound) return null;
    const g = typeof gain === 'function' ? gain(index) : gain;
    const out = sound(sampleRate, { seed: 500 + index, variation });
    if (g !== 1) for (let i = 0; i < out.length; i++) out[i]! *= g;
    return out;
  };
}
