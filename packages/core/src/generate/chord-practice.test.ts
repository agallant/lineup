import { describe, expect, it } from 'vitest';
import { chordPitchClasses, parseChordName } from '../chord-theory';
import { GUITAR_STANDARD } from '../guitar';
import { UKULELE_OPEN } from '../chord-shapes';
import { chordPracticeExercises } from './chord-practice';

describe('chord practice exercises', () => {
  const exercises = Object.entries(chordPracticeExercises());

  it('has ids for the ukulele and the guitar, and every chart is valid', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(30);
    for (const [id, chart] of exercises) {
      expect(id).toMatch(/^ex-(ukulele|guitar)-strum-[a-z0-9-]+$/);
      expect(chart.notes.length, id).toBeGreaterThan(8);
      expect(chart.meta.instruments, id).toEqual([
        id.startsWith('ex-guitar') ? 'guitar-strum' : 'ukulele-strum',
      ]);
    }
  });

  it('names each chord for the notes its written frets really sound (slides included)', () => {
    let checked = 0;
    for (const [id, chart] of exercises) {
      const open = id.startsWith('ex-guitar') ? GUITAR_STANDARD : UKULELE_OPEN;
      for (const n of chart.notes) {
        const frets = n.expected?.frets;
        if (!frets) continue;
        const chord = parseChordName(n.expected!.chord!)!;
        const sounding = new Set(
          frets.flatMap((f, i) => (f === null ? [] : [(open[i]! + f) % 12])),
        );
        const tones = new Set(chordPitchClasses(chord));
        expect(sounding.has(chord.root), `${id} ${n.expected!.chord}`).toBe(true);
        for (const pc of sounding) expect(tones.has(pc), `${id} ${n.expected!.chord}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});
