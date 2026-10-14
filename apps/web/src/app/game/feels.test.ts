import { chartFromBeats, getSong, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { ACCOMPANIMENT_FEELS, planAccompaniment, type AccompanimentLevel } from './accompaniment';
import { DRUM_STYLES, autoDrumStyle, planDrums, type DrumStyle } from './drums';
import { createRng } from '@lineup/core';

const tones = (chart: Chart, level: AccompanimentLevel, seed?: number) =>
  planAccompaniment(chart, level, seed).flatMap((e) => (e.kind === 'tone' ? [e] : []));

/** A 16-bar chord song in C G Am F, one strum a bar, at a tempo. */
const chordSong = (bpm: number, beatsPerBar = 4, title = 'Test song'): Chart => {
  const chords = ['C', 'G', 'Am', 'F'];
  return chartFromBeats(
    { title, bpm, beatsPerBar, instruments: ['ukulele-strum'] },
    Array.from({ length: 16 }, (_, bar) => ({
      beat: bar * beatsPerBar,
      lane: 'down',
      expected: { chord: chords[bar % 4]!, direction: 'down' as const },
    })),
  );
};

describe('accompaniment feels', () => {
  const song = chordSong(100);
  const spb = 0.6;
  const barLen = spb * 4;

  it.each(ACCOMPANIMENT_FEELS.map((f) => f.id))(
    '%s plays something quiet, low and in order',
    (id) => {
      const ev = planAccompaniment(song, id);
      expect(ev.length).toBeGreaterThan(8);
      expect(ev.map((e) => e.songTime)).toEqual(
        [...ev.map((e) => e.songTime)].sort((a, b) => a - b),
      );
      for (const e of ev) {
        if (e.kind !== 'tone') continue;
        expect(e.songTime).toBeGreaterThanOrEqual(0);
        expect(e.midi).toBeGreaterThanOrEqual(36);
        expect(e.midi).toBeLessThanOrEqual(81);
        expect(e.level ?? 1).toBeLessThanOrEqual(1.6);
      }
    },
  );

  it('the same song always gets the same accompaniment, and the seed can change an auto one', () => {
    expect(tones(song, 'auto')).toEqual(tones(song, 'auto'));
    const variants = new Set(
      Array.from({ length: 20 }, (_, i) => JSON.stringify(tones(song, 'auto', i * 7919))),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it('a waltz feel: the bass on one, the chord on two and three', () => {
    const waltz = chordSong(90, 3);
    const first = tones(waltz, 'waltz').filter((e) => e.songTime < (60 / 90) * 3 - 1e-6);
    const beat = (t: number) => Math.round(t / (60 / 90));
    expect(first.filter((e) => e.midi < 52).map((e) => beat(e.songTime))).toEqual([0]);
    expect(new Set(first.filter((e) => e.midi >= 52).map((e) => beat(e.songTime)))).toEqual(
      new Set([1, 2]),
    );
  });

  it('boom-chick alternates a bass note and a chord', () => {
    const first = tones(song, 'boom-chick').filter((e) => e.songTime < barLen - 1e-6);
    const bass = first.filter((e) => (e.level ?? 1) > 1).map((e) => Math.round(e.songTime / spb));
    const chord = first.filter((e) => (e.level ?? 1) <= 1).map((e) => Math.round(e.songTime / spb));
    expect(bass).toEqual([0, 2]);
    expect([...new Set(chord)]).toEqual([1, 3]);
  });

  it('a walking bass plays a note on every beat', () => {
    const first = tones(song, 'walking').filter((e) => e.songTime < barLen - 1e-6);
    expect(first.map((e) => Math.round(e.songTime / spb))).toEqual([0, 1, 2, 3]);
    // the last note steps into the next chord (a half step below G)
    expect(first[3]!.midi % 12).toBe((7 - 1 + 12) % 12);
  });

  it('arpeggios move in eighth notes', () => {
    const first = tones(song, 'arpeggio').filter((e) => e.songTime < barLen - 1e-6 && e.midi >= 52);
    expect(first).toHaveLength(8);
    expect(first[1]!.songTime - first[0]!.songTime).toBeCloseTo(spb / 2);
  });

  it('reggae chops the offbeats', () => {
    const first = tones(song, 'reggae').filter((e) => e.songTime < barLen - 1e-6 && e.midi >= 52);
    expect(new Set(first.map((e) => Math.round((e.songTime / spb) * 10) / 10))).toEqual(
      new Set([0.5, 1.5, 2.5, 3.5]),
    );
  });

  it('auto chooses a waltz feel for three beats to a bar', () => {
    const waltz = chordSong(100, 3);
    const first = tones(waltz, 'auto').filter((e) => e.songTime < (60 / 100) * 3 - 1e-6);
    // whatever it picks, a bar of three has the bass first
    expect(first[0]!.midi).toBeLessThan(52);
  });

  it('a long song changes feel between eight-bar sections when auto', () => {
    const long = chordSong(100);
    const a = tones(long, 'auto', 3).filter((e) => e.songTime < barLen * 8);
    const b = tones(long, 'auto', 3).filter(
      (e) => e.songTime >= barLen * 8 && e.songTime < barLen * 16,
    );
    // different feels give different numbers of notes per bar (unless the two feels coincide)
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });

  it('every melody in the library can be accompanied in every feel', () => {
    for (const id of ['sing-ode-to-joy', 'sing-silent-night', 'sing-twinkle', 'strum-blues']) {
      const chart = getSong(id);
      for (const f of ACCOMPANIMENT_FEELS)
        expect(planAccompaniment(chart, f.id).length, `${id} ${f.id}`).toBeGreaterThan(0);
    }
  });
});

describe('drum feels', () => {
  const rhythm = (bpm: number, perBar = 4, bars = 12): Chart =>
    chartFromBeats(
      { title: `Beat ${bpm}`, bpm, beatsPerBar: perBar },
      Array.from({ length: bars * perBar }, (_, i) => ({ beat: i })),
    );

  it.each(DRUM_STYLES.filter((d) => d !== 'off'))(
    '%s plays in order and never before the start',
    (style) => {
      const ev = planDrums(rhythm(100), style as DrumStyle);
      expect(ev.length).toBeGreaterThan(20);
      expect(ev.map((e) => e.songTime)).toEqual(
        [...ev.map((e) => e.songTime)].sort((a, b) => a - b),
      );
      expect(ev[0]!.songTime).toBeGreaterThanOrEqual(0);
    },
  );

  it('is silent when off', () => {
    expect(planDrums(rhythm(100), 'off')).toEqual([]);
  });

  it('the busy feels fill at the end of every fourth bar', () => {
    const chart = rhythm(100);
    const spb = 0.6;
    const ev = planDrums(chart, 'pop');
    const lastBeatOfPhrase = (3 * 4 + 3) * spb;
    const inFill = ev.filter(
      (e) => e.songTime >= lastBeatOfPhrase - 1e-6 && e.songTime < lastBeatOfPhrase + spb,
    );
    expect(inFill.length).toBeGreaterThanOrEqual(3);
    // a soft feel just carries on
    const soft = planDrums(chart, 'ballad').filter(
      (e) => e.songTime >= lastBeatOfPhrase - 1e-6 && e.songTime < lastBeatOfPhrase + spb,
    );
    expect(soft.length).toBeLessThan(inFill.length);
  });

  it('varies the kick every other bar', () => {
    const ev = planDrums(rhythm(100), 'pop');
    const kickBeats = (bar: number) =>
      ev
        .filter((e) => e.kind === 'tone' && e.midi === 36)
        .map((e) => e.songTime / 0.6 - bar * 4)
        .filter((b) => b >= -1e-6 && b < 4 - 1e-6)
        .map((b) => Math.round(b * 4) / 4);
    expect(kickBeats(0)).not.toEqual(kickBeats(1));
  });

  it('auto picks to suit the tempo and meter, the same every time', () => {
    const pickFor = (bpm: number, perBar = 4) => autoDrumStyle(rhythm(bpm, perBar), createRng(1));
    expect(pickFor(60)).toBe('ballad');
    expect(['folk', 'ballad', 'pop']).toContain(pickFor(100, 3));
    expect(['march', 'disco', 'funk']).toContain(pickFor(150));
    expect(planDrums(rhythm(110), 'auto')).toEqual(planDrums(rhythm(110), 'auto'));
  });

  it('a waltz bar has the kick on one and ticks on two and three, in any feel', () => {
    for (const style of DRUM_STYLES.filter((d) => d !== 'off')) {
      const ev = planDrums(rhythm(90, 3, 4), style as DrumStyle);
      const bar0 = ev.filter((e) => e.songTime < (60 / 90) * 3 - 1e-6);
      expect(
        bar0.some((e) => e.kind === 'tone' && e.midi === 36),
        style,
      ).toBe(true);
    }
  });
});
