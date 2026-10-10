/** The scales and modes the generators know. All but the pentatonics are modes of a major scale. */
export type ScaleId =
  'major' | 'minor' | 'dorian' | 'mixolydian' | 'major-pentatonic' | 'minor-pentatonic';

export interface ScaleDef {
  id: ScaleId;
  label: string;
  /** Semitones above the root of each degree within one octave, ascending. */
  steps: readonly number[];
  /**
   * The root of this scale, relative to the tonic of the major scale that holds the same notes
   * (A natural minor shares the notes of C major, so its root is 3 semitones below C's). A diatonic
   * instrument such as a whistle plays the scale by its own fingerings in the parent key.
   */
  rootFromParent: number;
}

export const SCALES: Readonly<Record<ScaleId, ScaleDef>> = {
  major: { id: 'major', label: 'Major scale', steps: [0, 2, 4, 5, 7, 9, 11], rootFromParent: 0 },
  minor: {
    id: 'minor',
    label: 'Natural minor scale',
    steps: [0, 2, 3, 5, 7, 8, 10],
    rootFromParent: -3,
  },
  dorian: { id: 'dorian', label: 'Dorian mode', steps: [0, 2, 3, 5, 7, 9, 10], rootFromParent: 2 },
  mixolydian: {
    id: 'mixolydian',
    label: 'Mixolydian mode',
    steps: [0, 2, 4, 5, 7, 9, 10],
    rootFromParent: -5,
  },
  'major-pentatonic': {
    id: 'major-pentatonic',
    label: 'Major pentatonic scale',
    steps: [0, 2, 4, 7, 9],
    rootFromParent: 0,
  },
  'minor-pentatonic': {
    id: 'minor-pentatonic',
    label: 'Minor pentatonic scale',
    steps: [0, 3, 5, 7, 10],
    rootFromParent: -3,
  },
};

/** The scale ids, in menu order. */
export const SCALE_IDS = Object.keys(SCALES) as ScaleId[];

const mod = (n: number, m: number): number => ((n % m) + m) % m;

/**
 * The MIDI note of a scale degree: degree 0 is the root, `steps.length` is the octave above it,
 * and negative degrees go below the root.
 */
export function degreeToMidi(scale: ScaleDef, root: number, degree: number): number {
  const n = scale.steps.length;
  const octave = Math.floor(degree / n);
  return root + 12 * octave + scale.steps[mod(degree, n)]!;
}

/** The pitch classes (0 = C … 11 = B) of the scale on a root, ascending from the root's class. */
export function scalePitchClasses(scale: ScaleDef, root: number): number[] {
  return scale.steps.map((s) => mod(root + s, 12));
}

/** The pitch classes of the major scale on `tonic`. */
export function majorPitchClasses(tonic: number): number[] {
  return scalePitchClasses(SCALES.major, tonic);
}
