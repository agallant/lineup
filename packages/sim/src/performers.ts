import { UKE_CHORDS, ukeNote, ukeStrum } from '@lineup/testkit';
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
