import { describe, expect, it } from 'vitest';
import {
  GUITAR_CHORD_FRETS,
  UKULELE_CHORD_FRETS,
  chordFrets,
  chordMidis,
  ukuleleHasChord,
} from './chords';
import { UKULELE_OPEN, chordPositions, chordVoicings } from './chord-shapes';
import { allChordNames, chordPitchClasses, parseChordName } from './chord-theory';
import { GUITAR_STANDARD } from './guitar';

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const soundingClasses = (open: readonly number[], frets: readonly (number | null)[]): Set<number> =>
  new Set(frets.flatMap((f, i) => (f === null ? [] : [mod12(open[i]! + f)])));

describe('chord fingerings for every chord', () => {
  it.each([
    ['ukulele', UKULELE_OPEN, false],
    ['guitar', GUITAR_STANDARD, true],
  ] as const)('every chord has a playable %s fingering of its own notes', (_, open, mutes) => {
    for (const name of allChordNames()) {
      const v = chordVoicings(open, name, mutes)[0];
      expect(v, name).toBeDefined();
      const chord = parseChordName(name)!;
      const classes = soundingClasses(open, v!.frets);
      // nothing outside the chord, and its root sounding
      const notes = new Set(chordPitchClasses(chord));
      for (const c of classes) expect(notes.has(c), `${name} ${v!.frets}`).toBe(true);
      expect(classes.has(chord.root), name).toBe(true);
      expect(v!.fingers, name).toBeLessThanOrEqual(4);
      expect(v!.frets.length).toBe(open.length);
      if (!mutes) expect(v!.frets.every((f) => f !== null)).toBe(true);
    }
  });

  it('finds the barre chords people know on the guitar', () => {
    const f = (n: string) => chordFrets('guitar-strum', n);
    expect(f('B')).toEqual([null, 2, 4, 4, 4, 2]);
    expect(f('F#')).toEqual([2, 4, 4, 3, 2, 2]);
    expect(f('F#m')).toEqual([2, 4, 4, 2, 2, 2]);
    expect(f('C#m')).toEqual([null, 4, 6, 6, 5, 4]);
    expect(f('Bm7')).toEqual([null, 2, 4, 2, 3, 2]);
    expect(f('Bbm')).toEqual([null, 1, 3, 3, 2, 1]);
  });

  it('finds the shapes people know on the ukulele', () => {
    const u = (n: string) => chordFrets(undefined, n);
    expect(u('F#')).toEqual([3, 1, 2, 1]);
    expect(u('B')).toEqual([4, 3, 2, 2]);
    expect(u('C#m')).toEqual([1, 1, 0, 4]);
    expect(u('Am7')).toEqual([0, 0, 0, 0]);
  });

  it('keeps the hand-picked fingerings, under any spelling of the name', () => {
    for (const [name, frets] of Object.entries(UKULELE_CHORD_FRETS)) {
      expect(chordFrets(undefined, name), name).toEqual(frets);
    }
    for (const [name, frets] of Object.entries(GUITAR_CHORD_FRETS)) {
      expect(chordFrets('guitar-strum', name), name).toEqual(frets);
    }
    expect(chordFrets(undefined, 'A#')).toEqual(UKULELE_CHORD_FRETS['Bb']);
    expect(chordFrets(undefined, 'Gbm')).toEqual(chordFrets(undefined, 'F#m'));
  });

  it('plays slash chords with the bass lowest on the guitar', () => {
    const frets = chordFrets('guitar-strum', 'G/B')!;
    const lowest = frets.flatMap((f, i) => (f === null ? [] : [GUITAR_STANDARD[i]! + f]));
    expect(mod12(Math.min(...lowest))).toBe(11);
  });

  it('plays a power chord as the major chord on the ukulele, in three notes on the guitar', () => {
    expect(chordFrets(undefined, 'F5')).toEqual(chordFrets(undefined, 'F'));
    expect(chordFrets('guitar-strum', 'E5')).toEqual([0, 2, 2, null, null, null]);
    expect(chordFrets('guitar-strum', 'Db5')).toEqual([null, 4, 6, 6, null, null]);
  });

  it('gives a ukulele slash chord its bass when that is easy, else the plain chord', () => {
    const lowest = (frets: readonly (number | null)[]) =>
      mod12(Math.min(...frets.map((f, i) => UKULELE_OPEN[i]! + f!)));
    expect(lowest(chordFrets(undefined, 'C/E')!)).toBe(4);
    expect(chordFrets(undefined, 'G/B')).toEqual(chordFrets(undefined, 'G'));
    expect(chordFrets(undefined, 'D/F#')).toEqual(chordFrets(undefined, 'D'));
    // a bass that is not in the chord is left out, not added to it
    expect(chordFrets(undefined, 'C/B')).toEqual(chordFrets(undefined, 'C'));
    expect(chordFrets(undefined, 'Am/G#')).toEqual(chordFrets(undefined, 'Am'));
    // even when a fingering with that bass is easy ([0 2 0 3] has D lowest)
    expect(chordFrets(undefined, 'C/D')).toEqual(chordFrets(undefined, 'C'));
  });

  it('knows no fingering for what is not a chord', () => {
    expect(chordFrets(undefined, 'Hm')).toBeNull();
    expect(ukuleleHasChord('Hm')).toBe(false);
    expect(ukuleleHasChord('Ebmaj7')).toBe(true);
  });

  it('finds fingerings in the other guitar tunings', () => {
    for (const id of ['guitar-strum-dropd', 'guitar-strum-dadgad', 'guitar-strum-openg']) {
      expect(chordFrets(id, 'F#m7'), id).not.toBeNull();
    }
  });

  it('works out the notes of a generated chord for the recognizer', () => {
    const midis = chordMidis(
      {
        id: 'ukulele-strum',
        tuning: { strings: UKULELE_OPEN.map((midi) => ({ midi })) },
      } as never,
      'B',
    );
    expect(new Set(midis?.map(mod12))).toEqual(new Set([3, 6, 11]));
  });
});

describe('chordPositions', () => {
  it('lists one chord in several places up the neck, lowest first', () => {
    const ps = chordPositions(UKULELE_OPEN, 'C', false);
    expect(ps.length).toBeGreaterThan(3);
    expect(ps[0]!.position).toBe(0);
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i]!.position).toBeGreaterThanOrEqual(ps[i - 1]!.position);
    }
    for (const p of ps) {
      expect(soundingClasses(UKULELE_OPEN, p.frets)).toEqual(new Set([0, 4, 7]));
    }
  });
});
