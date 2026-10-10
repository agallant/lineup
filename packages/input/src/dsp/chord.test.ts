import { UKE_CHORDS, UKE_OPEN_MIDI, addInto, roomNoise, silence, ukeStrum } from '@lineup/testkit';
import { describe, expect, it } from 'vitest';
import {
  CHORD_WINDOW,
  ChordRecognizer,
  chordChroma,
  chordTemplate,
  type ChordShapes,
} from './chord';

const SR = 48000;

/** Sounding MIDI notes of every testkit chord. */
const ALL: ChordShapes = Object.fromEntries(
  Object.entries(UKE_CHORDS).map(([name, frets]) => [
    name,
    frets.map((f, i) => UKE_OPEN_MIDI[i]! + f),
  ]),
);
const pick = (...names: string[]): ChordShapes =>
  Object.fromEntries(names.map((n) => [n, ALL[n]!]));

/** The window the strum analyzer would hand over: 8192 samples starting 30 ms after the attack. */
const windowOf = (strum: Float32Array, sr = SR): Float32Array => {
  const skip = Math.round(0.03 * sr);
  return strum.slice(skip, skip + CHORD_WINDOW);
};

describe('chordTemplate', () => {
  it('has its energy on the chord tones and their overtones, and is unit length', () => {
    const t = chordTemplate(ALL['C']!); // G C E C
    expect(Math.hypot(...t)).toBeCloseTo(1, 9);
    const pc = (name: string) =>
      ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(name);
    for (const tone of ['C', 'E', 'G']) expect(t[pc(tone)]!).toBeGreaterThan(0.2);
    // notes that are neither tones nor low overtones of C major carry nothing
    for (const other of ['C#', 'D#', 'F#', 'G#', 'A#']) expect(t[pc(other)]!).toBeLessThan(0.1);
  });

  it('differs between chords that share notes (Em and G)', () => {
    const a = chordTemplate(ALL['Em']!);
    const b = chordTemplate(ALL['G']!);
    let dot = 0;
    for (let i = 0; i < 12; i++) dot += a[i]! * b[i]!;
    expect(dot).toBeLessThan(0.97);
  });
});

describe('ChordRecognizer: all twelve chords at once', () => {
  const rec = new ChordRecognizer(ALL, SR, { minScore: 0, minMargin: 0 });

  it.each(Object.keys(ALL))('recognises %s, strummed down and up', (name) => {
    for (const direction of ['down', 'up'] as const) {
      for (const seed of [1, 2]) {
        const strum = ukeStrum(UKE_CHORDS[name]!, SR, { direction, seed });
        const best = rec.rank(windowOf(strum))[0]!;
        expect(best.chord, `${name} ${direction} #${seed}`).toBe(name);
      }
    }
  });
});

describe('ChordRecognizer: the chords of a song', () => {
  const sets = [
    ['C', 'Am', 'F', 'G'],
    ['G', 'C', 'D'],
    ['D', 'G', 'A', 'Em'],
    ['C', 'F', 'G7', 'Am'],
    ['Dm', 'G7', 'C', 'A7'],
  ];

  it.each(sets.map((s) => [s.join(' '), s] as const))(
    '%s: every chord is named with margin to spare',
    (_label, set) => {
      const rec = new ChordRecognizer(pick(...set), SR);
      for (const name of set) {
        for (const seed of [1, 2, 3]) {
          const m = rec.recognize(windowOf(ukeStrum(UKE_CHORDS[name]!, SR, { seed })));
          expect(m?.chord, `${name} #${seed}`).toBe(name);
          expect(m!.margin, `${name} #${seed}`).toBeGreaterThan(0.02);
          expect(m!.score).toBeGreaterThan(0.8);
        }
      }
    },
  );

  it('works at 44.1 kHz (an iPad default) as well', () => {
    const rec = new ChordRecognizer(pick('C', 'Am', 'F', 'G'), 44100);
    for (const name of ['C', 'Am', 'F', 'G']) {
      const m = rec.recognize(windowOf(ukeStrum(UKE_CHORDS[name]!, 44100, { seed: 4 }), 44100));
      expect(m?.chord).toBe(name);
    }
  });

  it.each([-45, -38])(
    'still names the chord in %d dBFS room noise (or says nothing), never a wrong one',
    (rmsDb) => {
      const rec = new ChordRecognizer(pick('C', 'Am', 'F', 'G'), SR);
      for (const name of ['C', 'Am', 'F', 'G']) {
        const noisy = addInto(
          ukeStrum(UKE_CHORDS[name]!, SR, { seed: 5 }),
          roomNoise(1, SR, { rmsDb, seed: 9 }),
        );
        const m = rec.recognize(windowOf(noisy));
        if (m) expect(m.chord, `${name} at ${rmsDb}`).toBe(name);
        // the three clearly separated chords are always named
        if (name !== 'Am') expect(m?.chord, `${name} at ${rmsDb}`).toBe(name);
      }
    },
  );
});

describe('ChordRecognizer: saying nothing when nothing fits', () => {
  const rec = new ChordRecognizer(pick('C', 'Am', 'F', 'G'), SR);

  it('silence is no chord', () => {
    expect(rec.recognize(silence(0.2, SR).slice(0, CHORD_WINDOW))).toBeNull();
  });

  it('room noise alone is no chord', () => {
    expect(
      rec.recognize(roomNoise(0.25, SR, { rmsDb: -30, seed: 2 }).slice(0, CHORD_WINDOW)),
    ).toBeNull();
  });

  it('a chord outside the song does not get a confident wrong answer when it differs enough', () => {
    // D major (D F# A, with a high A): of C Am F G nothing should clear the bar by a wide margin
    const m = rec.recognize(windowOf(ukeStrum(UKE_CHORDS['D']!, SR, { seed: 3 })));
    if (m) expect(m.score).toBeLessThan(0.97);
  });

  it('a single candidate has no margin to beat, only a score to clear', () => {
    const one = new ChordRecognizer(pick('C'), SR);
    const m = one.recognize(windowOf(ukeStrum(UKE_CHORDS['C']!, SR, { seed: 1 })));
    expect(m).toMatchObject({ chord: 'C', margin: 0 });
    expect(
      one.recognize(windowOf(ukeStrum(UKE_CHORDS['Dm']!, SR, { seed: 1 })))?.chord ?? 'none',
    ).toMatch(/none|C/);
  });

  it('refuses an empty candidate list', () => {
    expect(() => new ChordRecognizer({}, SR)).toThrow(/at least one chord/);
  });

  it('ranks every candidate, best first', () => {
    const ranked = rec.rank(windowOf(ukeStrum(UKE_CHORDS['F']!, SR, { seed: 1 })));
    expect(ranked.map((r) => r.chord)[0]).toBe('F');
    expect(ranked).toHaveLength(4);
    for (let i = 1; i < ranked.length; i++)
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
  });
});

describe('chordChroma', () => {
  it('is unit length for sound and all zeros for silence', () => {
    const c = chordChroma(windowOf(ukeStrum(UKE_CHORDS['C']!, SR)), SR);
    expect(Math.hypot(...c)).toBeCloseTo(1, 9);
    expect(Math.max(...chordChroma(new Float32Array(CHORD_WINDOW), SR))).toBe(0);
  });

  it('does not care how loud the strum is', () => {
    const a = chordChroma(
      windowOf(ukeStrum(UKE_CHORDS['G']!, SR, { amplitude: 0.5, seed: 1 })),
      SR,
    );
    const b = chordChroma(
      windowOf(ukeStrum(UKE_CHORDS['G']!, SR, { amplitude: 0.05, seed: 1 })),
      SR,
    );
    for (let i = 0; i < 12; i++) expect(b[i]!).toBeCloseTo(a[i]!, 5);
  });
});
