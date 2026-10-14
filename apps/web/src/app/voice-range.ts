import { bestOctaveShift } from '@lineup/core';

/** A singing voice by the notes it sings comfortably (MIDI numbers, C4 = 60). */
export interface VoiceRange {
  id: string;
  label: string;
  low: number;
  high: number;
}

/** The usual comfortable ranges of the voice types, a little inside the extremes. */
export const VOICE_RANGES: readonly VoiceRange[] = [
  { id: 'bass', label: 'Bass (E2–E4)', low: 40, high: 64 },
  { id: 'baritone', label: 'Baritone (A2–A4)', low: 45, high: 69 },
  { id: 'tenor', label: 'Tenor (C3–C5)', low: 48, high: 72 },
  { id: 'alto', label: 'Alto (F3–F5)', low: 53, high: 77 },
  { id: 'soprano', label: 'Soprano (C4–C6)', low: 60, high: 84 },
];

/** The ids a voice range setting may hold; 'any' means no preference. */
export const VOICE_CHOICES: readonly string[] = ['any', ...VOICE_RANGES.map((v) => v.id)];

export const isVoiceChoice = (v: unknown): v is string =>
  typeof v === 'string' && VOICE_CHOICES.includes(v);

/** How a song sits against a voice. */
export interface VoiceFit {
  /** Whole octaves (a multiple of 12) to move the song to sit best in the voice; 0 if it already does. */
  octave: number;
  /** After that move every note is within the voice. */
  fits: boolean;
  /** The song is wider than the voice, so some notes are out of reach wherever it sits. */
  tooWide: boolean;
}

/** Where a song (its lowest and highest note) sits against a voice type; null for 'any' or an unknown id. */
export function voiceFit(span: { low: number; high: number }, voiceId: string): VoiceFit | null {
  const voice = VOICE_RANGES.find((v) => v.id === voiceId);
  if (!voice) return null;
  const octave = bestOctaveShift(span, voice);
  return {
    octave,
    fits: span.low + octave >= voice.low && span.high + octave <= voice.high,
    tooWide: span.high - span.low > voice.high - voice.low,
  };
}

/** One sentence for the setup screen about how a song suits the voice. */
export function voiceFitText(fit: VoiceFit, voiceLabel: string): string {
  const where =
    fit.octave === 0
      ? ''
      : fit.octave < 0
        ? fit.octave === -12
          ? 'an octave lower'
          : `${-fit.octave / 12} octaves lower`
        : fit.octave === 12
          ? 'an octave higher'
          : `${fit.octave / 12} octaves higher`;
  if (fit.fits && fit.octave === 0) return `✓ Sits well in a ${voiceLabel} voice.`;
  if (fit.fits)
    return `✓ Sits well in a ${voiceLabel} voice ${where}; any octave counts, and the guide tone follows.`;
  if (fit.tooWide)
    return `This song is wider than a ${voiceLabel} voice: some notes will be a stretch${where ? `, best ${where}` : ''}.`;
  return `A stretch for a ${voiceLabel} voice${where ? `; ${where} is easier` : ''}.`;
}
