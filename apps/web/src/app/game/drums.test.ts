import { chartFromBeats } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { planAllBacking } from './backing';
import { planDrums } from './drums';

const song = (beatsPerBar?: number) =>
  chartFromBeats(
    {
      title: 't',
      artist: 'a',
      bpm: 120,
      instruments: ['voice'],
      ...(beatsPerBar ? { beatsPerBar } : {}),
    },
    Array.from({ length: 8 }, (_, i) => ({ beat: i, beats: 1, pitch: 60 })),
  );

describe('planDrums', () => {
  it('plays nothing when off', () => {
    expect(planDrums(song(), 'off')).toEqual([]);
  });

  it('rock: kick on 1 and 3, snare on 2 and 4, a hat on every eighth', () => {
    const ev = planDrums(song(), 'rock');
    const at = (midi: number) =>
      ev.filter((e) => e.kind === 'tone' && e.midi === midi).map((e) => e.songTime);
    expect(at(36).slice(0, 4)).toEqual([0, 1, 2, 3]); // beats 1 and 3 of two bars at 0.5s a beat
    expect(at(62).slice(0, 2)).toEqual([0.5, 1.5]);
    expect(at(96)).toHaveLength(16);
  });

  it('bossa: a kick on every beat', () => {
    const ev = planDrums(song(), 'bossa');
    expect(ev.filter((e) => e.kind === 'tone' && e.midi === 36)).toHaveLength(8);
  });

  it('a waltz gets a kick on one and hats on two and three', () => {
    const ev = planDrums(song(3), 'rock');
    expect(ev.filter((e) => e.kind === 'tone' && e.midi === 36).map((e) => e.songTime)).toEqual([
      0, 1.5, 3,
    ]);
    expect(ev.filter((e) => e.kind === 'tone' && e.midi === 62)).toHaveLength(0);
  });

  it('is part of the backing when asked, in song-time order', () => {
    const all = planAllBacking(song(), { metronome: false, guideTone: false, drums: 'rock' });
    expect(all.some((e) => e.kind === 'tone')).toBe(true);
    expect(all.map((e) => e.songTime)).toEqual(
      [...all.map((e) => e.songTime)].sort((a, b) => a - b),
    );
  });
});
