import { describe, expect, it } from 'vitest';
import { melodyNotes } from './notation';
import { parseAbc, transposeNotation } from './interchange';

describe('transposeNotation', () => {
  it('moves notes and keeps lengths, rests and bar lines', () => {
    expect(transposeNotation('C4 D4:2 | r:1 G4:1/3 F#4:.5', 2)).toBe('D4 E4:2 | r:1 A4:1/3 G#4:.5');
    expect(transposeNotation('C4 B3', 12)).toBe('C5 B4');
    expect(transposeNotation('C4 E4', -1)).toBe('B3 D#4');
  });

  it('moves a melody exactly: the notes it plays rise by the interval', () => {
    const text = 'E4 E4 F4 G4:2 r:1 A#3:.5';
    const a = melodyNotes(text);
    const b = melodyNotes(transposeNotation(text, 5));
    expect(b.map((n) => n.pitch! - 5)).toEqual(a.map((n) => n.pitch));
    expect(b.map((n) => n.beat)).toEqual(a.map((n) => n.beat));
  });

  it('refuses a bad note', () => {
    expect(() => transposeNotation('C4 H9', 1)).toThrow();
  });
});

const TWINKLE = `X:1
T:Twinkle, Twinkle
M:4/4
L:1/4
Q:1/4=100
K:C
C C G G | A A G2 | F F E E | D D C2 |
w:Twin-kle twin-kle lit-tle star`;

describe('parseAbc', () => {
  it('reads the title, tempo, key, notes and words', () => {
    const t = parseAbc(TWINKLE);
    expect(t).toMatchObject({ title: 'Twinkle, Twinkle', bpm: 100, key: 0 });
    expect(t.notes).toBe('C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2');
    expect(t.lyrics).toBe('Twin kle twin kle lit tle star');
    // and what it writes is a melody the app can play
    expect(melodyNotes(t.notes)).toHaveLength(14);
  });

  it('applies the key signature, bar accidentals, octaves, rests and lengths', () => {
    const t = parseAbc("T:x\nL:1/8\nK:G\nG,A,B,C D/2E/2 f2 | F ^F=F F z2 g' ||");
    // G major: F is sharp; the natural lasts the rest of the bar
    expect(t.key).toBe(7);
    expect(t.notes).toBe(
      'G3:1/2 A3:1/2 B3:1/2 C4:1/2 D4:1/4 E4:1/4 F#5:1 F#4:1/2 F#4:1/2 F4:1/2 F4:1/2 r:1 G6:1/2',
    );
  });

  it('reads minor and other modes as the major key holding the same notes', () => {
    expect(parseAbc('K:Am\nA B c').key).toBe(0);
    expect(parseAbc('K:Em\nE ^F G').key).toBe(7);
    expect(parseAbc('K:D\nD E F').key).toBe(2);
    expect(parseAbc('K:Gmix\nG A B').key).toBe(0);
    expect(parseAbc('K:Ddor\nD E F').key).toBe(0);
    // A minor has no sharps, E minor has one
    expect(parseAbc('K:Em\nF G').notes).toBe('F#4:1/2 G4:1/2');
  });

  it('handles ties, triplets, broken rhythm, chords, repeats and decorations', () => {
    const tied = parseAbc('L:1/4\nK:C\nC2- C2 D');
    expect(tied.notes).toBe('C4:4 D4:1');
    const triplet = parseAbc('L:1/4\nK:C\n(3CDE F');
    expect(triplet.notes).toBe('C4:2/3 D4:2/3 E4:2/3 F4:1');
    const broken = parseAbc('L:1/4\nK:C\nC>D E<F');
    expect(broken.notes).toBe('C4:3/2 D4:1/2 E4:1/2 F4:3/2');
    const noisy = parseAbc('L:1/4\nK:C\n|: "C"!f![CEG] ~D {c}E (F G) :|[1 A |]');
    expect(noisy.notes).toBe('G4:1 D4:1 E4:1 F4:1 G4:1 A4:1');
  });

  it('uses the right default note length and tempo', () => {
    // 6/8 and 4/4 both default to eighth notes (0.5 beat); under 3/4 it is a sixteenth
    expect(parseAbc('M:6/8\nK:C\nC').notes).toBe('C4:1/2');
    expect(parseAbc('M:2/4\nK:C\nC').notes).toBe('C4:1/4');
    expect(parseAbc('Q:3/8=60\nK:C\nC').bpm).toBe(90);
    expect(parseAbc('Q:90\nK:C\nC').bpm).toBe(90);
    expect(parseAbc('K:C\nC').bpm).toBe(100);
  });

  it('stops at the next tune and explains what it cannot read', () => {
    expect(parseAbc('X:1\nK:C\nC D\nX:2\nK:G\nA B').notes).toBe('C4:1/2 D4:1/2');
    expect(() => parseAbc('C D E')).toThrow(/K:/);
    expect(() => parseAbc('K:C')).toThrow(/no notes/);
    expect(() => parseAbc('K:C\nz z')).toThrow(/no notes/);
    expect(() => parseAbc('K:C\nC ? D')).toThrow(/Cannot read/);
    expect(() => parseAbc('K:Hm\nC')).toThrow(/key/);
    expect(() => parseAbc('K:C\n[CE')).toThrow(/not closed/);
  });
});
