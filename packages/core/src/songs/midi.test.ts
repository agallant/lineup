import { describe, expect, it } from 'vitest';
import { getSong } from '../songs';
import { melodyNotes } from './notation';
import { chartToMidi, detectKey, midiToMelody, midiToRhythm, parseMidi } from './midi';

describe('MIDI out', () => {
  it('writes a valid format 0 file with the tempo, meter, title and every note', () => {
    const chart = getSong('sing-hot-cross-buns');
    const bytes = chartToMidi(chart);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('MThd');
    const file = parseMidi(bytes);
    expect(file.bpm).toBeCloseTo(chart.meta.bpm, 0);
    expect(file.beatsPerBar).toBe(4);
    expect(file.title).toBe(chart.meta.title);
    expect(file.tracks).toHaveLength(1);
    expect(file.tracks[0]!.notes.map((n) => n.pitch)).toEqual(chart.notes.map((n) => n.pitch));
  });

  it('keeps a title with accents through a file', () => {
    const chart = { ...getSong('sing-hot-cross-buns') };
    chart.meta = { ...chart.meta, title: 'Frère Jacques ♪' };
    expect(parseMidi(chartToMidi(chart)).title).toBe('Frère Jacques ♪');
  });

  it('writes a waltz as 3 beats to the bar, strums as chords and drums on the percussion channel', () => {
    expect(parseMidi(chartToMidi(getSong('sing-silent-night'))).beatsPerBar).toBe(3);
    const strum = parseMidi(chartToMidi(getSong('strum-fifties')));
    expect(strum.tracks[0]!.notes.length).toBeGreaterThan(getSong('strum-fifties').notes.length);
    const drums = parseMidi(chartToMidi(getSong('kit-disco')));
    expect(drums.tracks[0]!.drum).toBe(true);
    expect(new Set(drums.tracks[0]!.notes.map((n) => n.pitch))).toEqual(new Set([36, 38, 42]));
  });
});

describe('MIDI in', () => {
  it('round-trips a melody through a file and back to the same notes and rhythm', () => {
    const chart = getSong('sing-ode-to-joy');
    const file = parseMidi(chartToMidi(chart));
    const m = midiToMelody(file.tracks[0]!, file.ppq);
    expect(m.kept).toBe(chart.notes.length);
    const back = melodyNotes(m.notes);
    expect(back.map((n) => n.pitch)).toEqual(chart.notes.map((n) => n.pitch));
    const spb = 60 / chart.meta.bpm;
    back.forEach((n, i) => expect(n.beat * spb).toBeCloseTo(chart.notes[i]!.t, 2));
    expect(m.key).toBe(0); // Ode to Joy is in C
  });

  it('finds the key of a tune in G', () => {
    expect(detectKey([67, 69, 71, 72, 74, 76, 78, 79])).toBe(7);
    expect(detectKey([60, 62, 64, 65, 67])).toBe(0);
  });

  it('keeps the highest note of a chord, reads triplets, and fills gaps with rests', () => {
    const ppq = 480;
    const track = {
      name: 't',
      channel: 0,
      drum: false,
      notes: [
        { tick: 0, duration: 480, pitch: 60 },
        { tick: 0, duration: 480, pitch: 64 }, // a chord: the top one is the melody
        { tick: 960, duration: 160, pitch: 62 }, // after a one-beat gap
        { tick: 1120, duration: 160, pitch: 64 },
        { tick: 1280, duration: 160, pitch: 65 },
      ],
    };
    const m = midiToMelody(track, ppq);
    expect(m.notes).toBe('E4:1 r:1 D4:1/3 E4:1/3 F4:1/3');
  });

  it('puts a very high or low track into the range My songs accepts, and cuts a long one', () => {
    const high = {
      name: 'h',
      channel: 0,
      drum: false,
      notes: [0, 1, 2].map((i) => ({ tick: i * 480, duration: 400, pitch: 110 + i })),
    };
    const m = midiToMelody(high, 480);
    for (const n of melodyNotes(m.notes)) {
      expect(n.pitch!).toBeGreaterThanOrEqual(36);
      expect(n.pitch!).toBeLessThanOrEqual(96);
    }
    const long = {
      name: 'l',
      channel: 0,
      drum: false,
      notes: Array.from({ length: 900 }, (_, i) => ({
        tick: i * 480,
        duration: 400,
        pitch: 60 + (i % 7),
      })),
    };
    const cut = midiToMelody(long, 480);
    expect(cut.kept).toBeLessThan(cut.found);
    expect(cut.notes.length).toBeLessThanOrEqual(3900);
    expect(() => midiToMelody({ name: 'e', channel: 0, drum: false, notes: [] }, 480)).toThrow();
  });

  it('reads a drum track as a kit rhythm', () => {
    const file = parseMidi(chartToMidi(getSong('kit-rock-fill')));
    const r = midiToRhythm(file.tracks[0]!, file.ppq, file.beatsPerBar);
    expect(r.stepsPerBeat).toBe(2);
    expect(r.bars).toBe(4);
    expect(r.lanes).toMatch(/^kick: x\.\.\.x\.\.\. \|/);
    expect(r.lanes.split('\n').map((l) => l.split(':')[0])).toEqual(['kick', 'snare', 'hat']);
  });

  it('refuses a track whose events run past its own end instead of re-reading later bytes', () => {
    // two tracks; the first declares 8 bytes but holds a title of 200 bytes, which would spill into the next
    const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0x01, 0xe0];
    const trackA = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 8, 0, 0xff, 0x03, 0x81, 0x48, 65, 65, 65];
    const rest = new Array(300).fill(65);
    const bad = new Uint8Array([...head, ...trackA, ...rest]);
    expect(() => parseMidi(bad)).toThrow(/damaged/);
    // a system-exclusive message past the end is refused the same way
    const sysex = new Uint8Array([
      ...head.slice(0, 11),
      1,
      ...head.slice(12),
      0x4d,
      0x54,
      0x72,
      0x6b,
      0,
      0,
      0,
      6,
      0,
      0xf0,
      0x7f,
      1,
      2,
      3,
    ]);
    expect(() => parseMidi(sysex)).toThrow(/damaged/);
  });

  it('explains files it cannot read', () => {
    expect(() =>
      parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])),
    ).toThrow(/not a MIDI/);
    expect(() => parseMidi(new Uint8Array([]))).toThrow(/cut short/);
    const good = chartToMidi(getSong('sing-ode-to-joy'));
    expect(() => parseMidi(good.subarray(0, 30))).not.toThrow(/not a MIDI/);
    expect(() => parseMidi(new Uint8Array(3_000_000))).toThrow(/too big/);
    const noNotes = new Uint8Array([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0],
      ...[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 4, 0, 0xff, 0x2f, 0],
    ]);
    expect(() => parseMidi(noNotes)).toThrow(/no notes/);
  });
});
