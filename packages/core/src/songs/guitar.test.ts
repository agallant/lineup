import { describe, expect, it } from 'vitest';
import { GUITAR_CHORD_FRETS, UKULELE_CHORD_FRETS, chordMidis, noteFrets } from '../chords';
import { getProfile } from '../profiles';
import { getSong, songsFor } from './index';
import {
  GUITAR_STANDARD as GUITAR_OPEN,
  GUITAR_TUNINGS,
  guitarFamily,
  guitarOpenFor,
  guitarPluck,
  retuneFrets,
} from '../guitar';
import { guitarChart } from './notation';
import { chartToMidi } from './midi';

describe('guitar chords', () => {
  it('has a six-string fingering for every chord the ukulele has', () => {
    expect(Object.keys(GUITAR_CHORD_FRETS).sort()).toEqual(Object.keys(UKULELE_CHORD_FRETS).sort());
    for (const frets of Object.values(GUITAR_CHORD_FRETS)) expect(frets).toHaveLength(6);
  });

  it('every guitar chord sounds the same notes as its name says (root and third or fifth)', () => {
    const roots: Record<string, number> = {
      C: 0,
      G: 7,
      Am: 9,
      F: 5,
      D: 2,
      Em: 4,
      Dm: 2,
      A: 9,
      G7: 7,
      C7: 0,
      A7: 9,
      D7: 2,
      Bm: 11,
      Bb: 10,
      Gm: 7,
      Cm: 0,
      'F#m': 6,
      E: 4,
      E7: 4,
      B7: 11,
    };
    const guitar = getProfile('guitar-strum');
    for (const [name, root] of Object.entries(roots)) {
      const midis = chordMidis(guitar, name)!;
      expect(midis.length, name).toBeGreaterThanOrEqual(4);
      // the lowest sounding note is the root (or, for a few open voicings, the fifth)
      const bass = midis[0]! % 12;
      expect([root, (root + 7) % 12], name).toContain(bass);
      expect(
        midis.map((m) => m % 12),
        name,
      ).toContain(root);
    }
  });

  it('muted strings sound nothing and the profile picks the table', () => {
    const guitar = getProfile('guitar-strum');
    expect(chordMidis(guitar, 'D')).toEqual([50, 57, 62, 66]);
    expect(chordMidis(getProfile('ukulele-strum'), 'C')).toEqual([67, 60, 64, 72]);
    expect(noteFrets({ t: 0, duration: 0, expected: { chord: 'Em' } }, 'guitar-strum')).toEqual([
      0, 2, 2, 0, 0, 0,
    ]);
    expect(noteFrets({ t: 0, duration: 0, expected: { chord: 'Em' } })).toEqual([0, 4, 3, 2]);
  });
});

describe('guitarPluck', () => {
  it('uses the lowest fret that reaches the note', () => {
    expect(guitarPluck(64)).toEqual([null, null, null, null, null, 0]); // open high E
    expect(guitarPluck(60)).toEqual([null, null, null, null, 1, null]); // C4 on the B string
    expect(guitarPluck(40)).toEqual([0, null, null, null, null, null]);
  });
  it('sounds the pitch it was asked for', () => {
    for (let p = 40; p <= 76; p++) {
      const frets = guitarPluck(p);
      const i = frets.findIndex((f) => f !== null);
      expect(GUITAR_OPEN[i]! + frets[i]!).toBe(p);
    }
  });
  it('refuses a note off the guitar', () => {
    expect(() => guitarPluck(30)).toThrow(/not on the guitar/);
  });
});

describe('guitarChart', () => {
  it('moves a ukulele song to the guitar, keeping its chords and timing', () => {
    const uke = getSong('strum-four-chords');
    const g = guitarChart(uke);
    expect(g.meta.instruments).toEqual(['guitar-strum']);
    expect(g.notes.map((n) => [n.t, n.expected?.chord])).toEqual(
      uke.notes.map((n) => [n.t, n.expected?.chord]),
    );
  });

  it('moves picked notes onto guitar strings with their pitch written in', () => {
    const uke = getSong('strum-picking');
    const g = guitarChart(uke);
    g.notes.forEach((n, i) => {
      expect(n.expected!.frets).toHaveLength(6);
      expect(n.pitch).toBeDefined();
      const frets = n.expected!.frets!;
      const s = frets.findIndex((f) => f !== null);
      expect(GUITAR_OPEN[s]! + frets[s]!).toBe(n.pitch);
      expect(n.t).toBe(uke.notes[i]!.t);
    });
  });

  it('leaves other instruments’ charts alone', () => {
    const voice = getSong('sing-mary-lamb');
    expect(guitarChart(voice)).toBe(voice);
  });

  it('the guitar has every ukulele song, and none of its own ids differ', () => {
    expect(songsFor('guitar-strum').map((s) => s.id)).toEqual(
      songsFor('ukulele-strum').map((s) => s.id),
    );
  });
});

describe('guitar in MIDI', () => {
  it('a guitar chord exports as its own notes, not the ukulele’s', () => {
    const chart = guitarChart(getSong('strum-four-chords'));
    const ukeBytes = chartToMidi(getSong('strum-four-chords'));
    const gtrBytes = chartToMidi(chart);
    expect(gtrBytes.length).toBeGreaterThan(ukeBytes.length); // six strings instead of four
  });
});

describe('alternate guitar tunings', () => {
  it('reads guitar profile ids', () => {
    expect(guitarFamily('guitar-strum')).toMatchObject({ kind: 'strum' });
    expect(guitarFamily('guitar-note-dropd')).toMatchObject({ kind: 'note' });
    expect(guitarOpenFor('guitar-strum-dadgad')).toEqual([38, 45, 50, 55, 57, 62]);
    expect(guitarFamily('ukulele-strum')).toBeNull();
    expect(guitarFamily('guitar-strum-nope')).toBeNull();
    expect(guitarFamily(undefined)).toBeNull();
  });

  it('a profile exists for every tuning, strum and note, with that tuning', () => {
    for (const t of GUITAR_TUNINGS) {
      for (const kind of ['strum', 'note']) {
        const p = getProfile(`guitar-${kind}${t.suffix}`);
        expect(p.tuning!.strings.map((s) => s.midi)).toEqual([...t.open]);
      }
    }
  });

  it('chords sound the same notes in every tuning', () => {
    const std = chordMidis(getProfile('guitar-strum'), 'G')!;
    for (const t of GUITAR_TUNINGS) {
      const midis = chordMidis(getProfile(`guitar-strum${t.suffix}`), 'G')!;
      expect([...midis].sort()).toEqual([...std].sort());
    }
  });

  it('drop D moves the low string down a tone: a D chord gets a fifth string note', () => {
    expect(retuneFrets([3, 2, 0, 0, 0, 3], [38, 45, 50, 55, 59, 64])).toEqual([5, 2, 0, 0, 0, 3]);
    // a fret that would go below the nut is muted
    expect(retuneFrets([0, null, null, null, null, null], [42, 45, 50, 55, 59, 64])).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('picks melodies on the strings of the tuning', () => {
    const chart = guitarChart(getSong('strum-picking'), 'guitar-strum-dropd');
    expect(chart.meta.instruments).toEqual(['guitar-strum-dropd']);
    for (const n of chart.notes) {
      const f = n.expected!.frets!;
      const s = f.findIndex((x) => x !== null);
      expect(guitarOpenFor('guitar-strum-dropd')![s]! + f[s]!).toBe(n.pitch);
    }
    expect(songsFor('guitar-strum-openg')).toHaveLength(songsFor('ukulele-strum').length);
  });
});
