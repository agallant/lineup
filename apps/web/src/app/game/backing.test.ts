import { SongClock, chartFromBeats, getSong } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  midiToHz,
  planAllBacking,
  planBacking,
  droneKeyNote,
  planDrone,
  playBacking,
  rhythmTones,
  type AudioOut,
} from './backing';

const chart = chartFromBeats({ title: 'T', bpm: 120, countInBeats: 4 }, [
  { beat: 0, beats: 1, pitch: 60 },
  { beat: 1, beats: 2, pitch: 64 },
  { beat: 4, beats: 1, pitch: 67 },
]);

describe('planBacking', () => {
  it('always counts in: one click per beat before song time 0, first one accented', () => {
    const plan = planBacking(chart, { metronome: false, guideTone: false });
    expect(plan).toEqual([
      { kind: 'click', songTime: -2, accent: true },
      { kind: 'click', songTime: -1.5, accent: false },
      { kind: 'click', songTime: -1, accent: false },
      { kind: 'click', songTime: -0.5, accent: false },
    ]);
  });

  it('adds a beat click through the end of the song when the metronome is on, accenting each bar', () => {
    const clicks = planBacking(chart, { metronome: true, guideTone: false }).filter(
      (e) => e.songTime >= 0,
    );
    expect(clicks.map((e) => e.songTime)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]); // the last note ends at 2.5 s
    expect(clicks.filter((e) => e.kind === 'click' && e.accent).map((e) => e.songTime)).toEqual([
      0, 2,
    ]);
  });

  it('adds guide tones at each note with its pitch and length', () => {
    const tones = planBacking(chart, { metronome: false, guideTone: true }).filter(
      (e) => e.kind === 'tone',
    );
    expect(tones).toEqual([
      { kind: 'tone', songTime: 0, duration: 0.5, midi: 60 },
      { kind: 'tone', songTime: 0.5, duration: 1, midi: 64 },
      { kind: 'tone', songTime: 2, duration: 0.5, midi: 67 },
    ]);
  });

  it('is sorted by time', () => {
    const plan = planBacking(chart, { metronome: true, guideTone: true });
    expect(plan.map((e) => e.songTime)).toEqual(
      [...plan.map((e) => e.songTime)].sort((a, b) => a - b),
    );
  });

  it('has no count-in for a chart that asks for none', () => {
    const c = chartFromBeats({ title: 'T', bpm: 120, countInBeats: 0 }, [{ beat: 0, pitch: 60 }]);
    expect(planBacking(c, { metronome: false, guideTone: false })).toEqual([]);
  });
});

describe('midiToHz', () => {
  it.each([
    [69, 440],
    [60, 261.6256],
    [81, 880],
  ])('%d -> %f', (m, hz) => expect(midiToHz(m)).toBeCloseTo(hz, 3));
});

/** Records what was scheduled, in AudioContext time. */
function fakeAudio(currentTime: number) {
  const started: { freq: number; at: number }[] = [];
  const stopped: number[] = [];
  const ctx: AudioOut = {
    currentTime,
    destination: {} as AudioNode,
    createGain: () =>
      ({
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect: (n: AudioNode) => n,
      }) as unknown as GainNode,
    createOscillator: () => {
      const o = {
        frequency: { value: 0 },
        connect: (g: { connect: (n: AudioNode) => AudioNode }) => g,
        start(at: number) {
          started.push({ freq: o.frequency.value, at });
        },
        stop(at?: number) {
          stopped.push(at ?? -1);
        },
      };
      return o as unknown as OscillatorNode;
    },
  };
  return { ctx, started, stopped };
}

describe('playBacking', () => {
  it('maps song time to audio time through the clock and schedules every future event', () => {
    const { ctx, started } = fakeAudio(10);
    const clock = new SongClock({ currentTime: 10 });
    clock.start(-2, 10.5); // song time 0 happens at audio time 12.5
    const events = planBacking(chart, { metronome: false, guideTone: true });
    playBacking(ctx, clock, events);
    const clickTimes = started.filter((s) => s.freq === 1000 || s.freq === 1500).map((s) => s.at);
    expect(clickTimes).toEqual([10.5, 11, 11.5, 12]);
    const tones = started.filter((s) => s.freq < 900);
    expect(tones.map((t) => [Math.round(t.freq), t.at])).toEqual([
      [262, 12.5],
      [330, 13],
      [392, 14.5],
    ]);
  });

  it('skips events already in the past and stops everything on request', () => {
    const { ctx, started, stopped } = fakeAudio(12);
    const clock = new SongClock({ currentTime: 12 });
    clock.start(-2, 10); // started 2 s ago
    const handle = playBacking(
      ctx,
      clock,
      planBacking(chart, { metronome: false, guideTone: true }),
    );
    expect(started.every((s) => s.at >= 11.98)).toBe(true);
    // song time 0 is audio time 12 = now: the four count-in clicks (audio 10-11.5) are past, the 3 tones remain
    expect(started).toHaveLength(3);
    const before = stopped.length;
    handle.stop();
    expect(stopped.length).toBeGreaterThan(before);
  });
});

describe('planAllBacking', () => {
  const song = getSong('strum-fifties');
  it('is just the clicks and tones when accompaniment is off', () => {
    const opts = { metronome: true, guideTone: false };
    expect(planAllBacking(song, { ...opts, accompaniment: 'off' })).toEqual(
      planBacking(song, opts),
    );
    expect(planAllBacking(song, opts)).toEqual(planBacking(song, opts));
  });

  it('adds the accompaniment in time order, and accents the first beat of a waltz bar', () => {
    const events = planAllBacking(song, {
      metronome: true,
      guideTone: false,
      accompaniment: 'bass',
    });
    expect(events.length).toBeGreaterThan(
      planBacking(song, { metronome: true, guideTone: false }).length,
    );
    expect(events.map((e) => e.songTime)).toEqual(
      [...events.map((e) => e.songTime)].sort((a, b) => a - b),
    );
    const waltz = getSong('strum-waltz');
    const accents = planBacking(waltz, { metronome: true, guideTone: false })
      .filter((e) => e.kind === 'click' && e.accent && e.songTime >= 0)
      .map((e) => Math.round((e.songTime / (60 / waltz.meta.bpm)) * 100) / 100);
    expect(accents.slice(0, 3)).toEqual([0, 3, 6]);
  });
});

describe('rhythmTones', () => {
  it('ticks every hit of a rhythm, lower for a kick than a hat', () => {
    const groove = getSong('kit-halftime');
    const ticks = rhythmTones(groove);
    expect(ticks).toHaveLength(groove.notes.length);
    expect(ticks.map((t) => t.songTime)).toEqual(groove.notes.map((n) => n.t));
    const pitchOf = (lane: string) => ticks[groove.notes.findIndex((n) => n.lane === lane)]!.midi;
    expect(pitchOf('kick')).toBeLessThan(pitchOf('snare'));
    expect(pitchOf('snare')).toBeLessThan(pitchOf('hat'));
  });
});

describe('planDrone', () => {
  it('plays nothing when off', () => {
    expect(planDrone(chart, 69, 'off')).toEqual([]);
  });

  it('holds the key note low for the whole song, starting with the count-in', () => {
    const [root, ...rest] = planDrone(chart, 69, 'root');
    expect(rest).toEqual([]);
    // A4 held as A3 (below the detector's range), from the first count-in click to the end
    expect(root).toMatchObject({ kind: 'tone', midi: 57, wave: 'sine', songTime: -2 });
    const end =
      (root as { songTime: number; duration: number }).songTime +
      (root as { duration: number }).duration;
    expect(end).toBeGreaterThanOrEqual(2.5 + 0.5); // the last note ends at 2.5 s
  });

  it('adds the fifth, and keeps every key in the same octave', () => {
    const events = planDrone(chart, 62, 'fifth');
    expect(events.map((e) => (e.kind === 'tone' ? e.midi : 0))).toEqual([50, 57]);
    for (const root of [60, 61, 66, 71, 75, 90]) {
      const [e] = planDrone(chart, root, 'root');
      const midi = e!.kind === 'tone' ? e!.midi : 0;
      expect(midi).toBeGreaterThanOrEqual(48);
      expect(midi).toBeLessThan(60);
      expect(Math.abs(midi - root) % 12).toBe(0);
    }
  });

  it('is part of the backing when asked for', () => {
    const all = planAllBacking(chart, {
      metronome: false,
      guideTone: false,
      drone: { type: 'root', root: 69 },
    });
    expect(all.some((e) => e.kind === 'tone' && e.midi === 57)).toBe(true);
    expect(all.map((e) => e.songTime)).toEqual(
      [...all.map((e) => e.songTime)].sort((a, b) => a - b),
    );
  });
});

describe('droneKeyNote', () => {
  const song = (tonic: number | undefined, pitches: number[]) =>
    chartFromBeats(
      { title: 't', artist: 'a', bpm: 100, ...(tonic === undefined ? {} : { tonic }) },
      pitches.map((pitch, i) => ({ beat: i, beats: 1, pitch })),
    );
  it('is the tonic for a song that ends on it', () => {
    expect(droneKeyNote(song(60, [64, 62, 60]))).toBe(60);
  });
  it('is the relative minor for a song that ends there (A minor over a C tonic)', () => {
    expect(droneKeyNote(song(60, [69, 72, 64, 57]))).toBe(57);
    expect(droneKeyNote(song(60, [69, 72, 64, 69]))).toBe(57);
  });
  it('falls back to the tonic, or C, when unsure', () => {
    expect(droneKeyNote(song(62, [64, 66]))).toBe(62);
    expect(droneKeyNote(song(undefined, [64, 66]))).toBe(60);
  });
});
