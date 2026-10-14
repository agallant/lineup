/** A guitar tuning: the open strings low to high, as MIDI notes. */
export interface GuitarTuning {
  /** Ends the profile ids: "guitar-strum" for standard, "guitar-strum-dropd" for drop D. */
  suffix: string;
  label: string;
  open: readonly number[];
}

/** The guitar tunings the game offers (standard first). */
export const GUITAR_TUNINGS: readonly GuitarTuning[] = [
  { suffix: '', label: 'standard (E A D G B E)', open: [40, 45, 50, 55, 59, 64] },
  { suffix: '-dropd', label: 'drop D (D A D G B E)', open: [38, 45, 50, 55, 59, 64] },
  { suffix: '-dadgad', label: 'DADGAD', open: [38, 45, 50, 55, 57, 62] },
  { suffix: '-openg', label: 'open G (D G D G B D)', open: [38, 43, 50, 55, 59, 62] },
];

/** The standard tuning's open strings. */
export const GUITAR_STANDARD = GUITAR_TUNINGS[0]!.open;

const ID = /^guitar-(strum|note)(-[a-z]+)?$/;

/**
 * Reads a guitar profile id ("guitar-strum", "guitar-note-dropd"...): whether it strums or plucks
 * notes, and which tuning. Null for any other id.
 */
export function guitarFamily(
  profileId: string | undefined,
): { kind: 'strum' | 'note'; tuning: GuitarTuning } | null {
  const m = ID.exec(profileId ?? '');
  if (!m) return null;
  const tuning = GUITAR_TUNINGS.find((t) => t.suffix === (m[2] ?? ''));
  return tuning ? { kind: m[1] as 'strum' | 'note', tuning } : null;
}

/** The open strings of a guitar profile, or null for another instrument. */
export const guitarOpenFor = (profileId: string | undefined): readonly number[] | null =>
  guitarFamily(profileId)?.tuning.open ?? null;

/** The highest fret a picked guitar melody is moved to (it takes the lowest that reaches each note). */
const MAX_FRET = 15;

/** The fret to hold on each string to pluck `pitch`: the lowest fret that reaches it. */
export function guitarPluck(
  pitch: number,
  open: readonly number[] = GUITAR_STANDARD,
): (number | null)[] {
  let best = -1;
  let bestFret = Infinity;
  open.forEach((o, i) => {
    const fret = pitch - o;
    if (fret >= 0 && fret <= MAX_FRET && fret < bestFret) {
      best = i;
      bestFret = fret;
    }
  });
  if (best < 0) throw new Error(`MIDI ${pitch} is not on the guitar below fret ${MAX_FRET}`);
  return open.map((_, i) => (i === best ? bestFret : null));
}

/**
 * A chord fingering for another tuning that sounds the same notes: each string is fretted to the
 * pitch it has in the standard shape (a muted string stays muted). A string that would need a
 * negative fret is muted.
 */
export function retuneFrets(
  frets: readonly (number | null)[],
  open: readonly number[],
): (number | null)[] {
  return frets.map((f, i) => {
    if (f === null) return null;
    const fret = GUITAR_STANDARD[i]! + f - open[i]!;
    return fret >= 0 ? fret : null;
  });
}
