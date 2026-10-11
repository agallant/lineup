const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** Concert pitch reference: frequency of A4 (MIDI 69) in Hz. */
export const A4_HZ = 440;

/** The nearest equal-tempered note for a frequency, with the offset from it. */
export interface NoteInfo {
  /** Nearest MIDI note number. */
  midi: number;
  /** Pitch class name, e.g. "C#". */
  name: string;
  octave: number;
  /** Scientific pitch notation, e.g. "A4". */
  label: string;
  /** Deviation from the nearest equal-tempered note, -50..+50. */
  cents: number;
}

/** Frequency in Hz of a MIDI note number (A4 = 69 = 440 Hz); fractional values are allowed. */
export function midiToFrequency(midi: number): number {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

/** Fractional MIDI note number for a frequency. */
export function frequencyToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ);
}

/** Signed distance in cents from referenceHz to hz (positive = hz is sharp). */
export function centsBetween(hz: number, referenceHz: number): number {
  return 1200 * Math.log2(hz / referenceHz);
}

/** Scientific pitch name for a MIDI note number, e.g. 60 gives "C4". */
export function midiLabel(midi: number): string {
  const name = NAMES[((midi % 12) + 12) % 12] ?? '?';
  return `${name}${Math.floor(midi / 12) - 1}`;
}

/** The nearest note to a frequency in Hz, with its name, octave and cents offset. */
export function noteFromFrequency(hz: number): NoteInfo {
  const exact = frequencyToMidi(hz);
  const midi = Math.round(exact);
  const name = NAMES[((midi % 12) + 12) % 12] ?? '?';
  const octave = Math.floor(midi / 12) - 1;
  return { midi, name, octave, label: `${name}${octave}`, cents: (exact - midi) * 100 };
}

/** One open string of the ukulele, with its MIDI pitch. */
export interface UkuleleString {
  /** Physical string number, 4 (nearest the chin, G) to 1 (A). */
  number: 4 | 3 | 2 | 1;
  label: string;
  midi: number;
}

/** Standard re-entrant GCEA tuning: G4 C4 E4 A4. */
export const UKULELE_GCEA: readonly UkuleleString[] = [
  { number: 4, label: 'G4', midi: 67 },
  { number: 3, label: 'C4', midi: 60 },
  { number: 2, label: 'E4', midi: 64 },
  { number: 1, label: 'A4', midi: 69 },
];

/** Nearest open string to a frequency, with the tuner offset in cents. */
export function nearestOpenString(hz: number): { string: UkuleleString; cents: number } {
  let best = UKULELE_GCEA[0]!;
  let bestCents = Infinity;
  for (const s of UKULELE_GCEA) {
    const c = centsBetween(hz, midiToFrequency(s.midi));
    if (Math.abs(c) < Math.abs(bestCents)) {
      best = s;
      bestCents = c;
    }
  }
  return { string: best, cents: bestCents };
}

/**
 * Signed cents of a sung/played frequency from a target MIDI pitch. With
 * `octaveForgiving` the right pitch class in any octave counts as zero.
 */
export function deviationCents(hz: number, targetMidi: number, octaveForgiving = false): number {
  let cents = centsBetween(hz, midiToFrequency(targetMidi));
  if (octaveForgiving) cents -= 1200 * Math.round(cents / 1200);
  return cents;
}
