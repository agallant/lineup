import { describe, expect, it } from 'vitest';
import { createRng } from './random';
import {
  EAR_KINDS,
  EAR_LEVELS,
  earChoices,
  earId,
  earQuestion,
  earRound,
  earTitle,
  isEarKind,
  isEarLevel,
} from './ear';

describe('earQuestion', () => {
  it('asks only for names it offers, and plays what it names', () => {
    for (const kind of EAR_KINDS) {
      for (const level of EAR_LEVELS) {
        const choices = earChoices(kind, level);
        const q = earRound(kind, level, 5, 60);
        for (const question of q) {
          expect(choices, `${kind} ${level}`).toContain(question.answer);
          expect(question.choices).toEqual(choices);
          expect(question.together).toBe(kind === 'chords');
          expect(Math.min(...question.notes)).toBeGreaterThanOrEqual(55);
          expect(Math.max(...question.notes)).toBeLessThanOrEqual(55 + 11 + 12);
        }
      }
    }
  });

  it('plays the right size of interval and shape of chord', () => {
    const size = (q: ReturnType<typeof earQuestion>) => Math.abs(q.notes[1]! - q.notes[0]!);
    const names: Record<string, number> = {
      'Perfect 5th': 7,
      'Major 3rd': 4,
      Octave: 12,
      'Minor 3rd': 3,
      'Perfect 4th': 5,
    };
    for (const q of earRound('intervals', 'easy', 11, 40)) expect(size(q)).toBe(names[q.answer]);
    const chords: Record<string, number[]> = { Major: [0, 4, 7], Minor: [0, 3, 7] };
    for (const q of earRound('chords', 'easy', 11, 40)) {
      expect(q.notes.map((n) => n - q.notes[0]!)).toEqual(chords[q.answer]);
    }
    const hard = earRound('chords', 'hard', 3, 80);
    expect(new Set(hard.map((q) => q.answer)).size).toBe(6);
  });

  it('never repeats an answer straight away, and is the same for the same seed', () => {
    const round = earRound('intervals', 'medium', 9, 50);
    for (let i = 1; i < round.length; i++) expect(round[i]!.answer).not.toBe(round[i - 1]!.answer);
    expect(earRound('intervals', 'medium', 9, 50)).toEqual(round);
    expect(earRound('intervals', 'medium', 10, 50)).not.toEqual(round);
    expect(earQuestion('chords', 'easy', createRng(1))).toEqual(
      earQuestion('chords', 'easy', createRng(1)),
    );
  });

  it('plays a falling interval now and then, only above the easy level', () => {
    const falls = (level: 'easy' | 'hard') =>
      earRound('intervals', level, 2, 80).filter((q) => q.notes[0]! > q.notes[1]!).length;
    expect(falls('easy')).toBe(0);
    expect(falls('hard')).toBeGreaterThan(0);
  });
});

describe('ids', () => {
  it('names a round and finds the title again', () => {
    expect(earId('intervals', 'easy')).toBe('ear-intervals-easy');
    expect(earTitle('ear-chords-hard')).toBe('Ear training: chords, hard');
    expect(earTitle('sing-hot-cross-buns')).toBeNull();
    expect(isEarKind('chords')).toBe(true);
    expect(isEarKind('rhythm')).toBe(false);
    expect(isEarLevel('hard')).toBe(true);
    expect(isEarLevel('insane')).toBe(false);
  });
});
