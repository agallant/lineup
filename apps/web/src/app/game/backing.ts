import type { Chart, SongClock } from '@lineup/core';
import { planAccompaniment, type AccompanimentLevel } from './accompaniment';
import { planDrums, type DrumStyle } from './drums';
import { canPlayDrums, playDrum, type DrumVoice } from './drum-sound';
import { canPlayVoices, playVoice, type Voice, type VoiceContext } from './voices';

export type BackingEvent =
  | { kind: 'click'; songTime: number; accent: boolean }
  | {
      kind: 'tone';
      songTime: number;
      duration: number;
      midi: number;
      /** Loudness relative to the guide tone (0.16 on the audio output); 1 when absent. Drums use up to 1.6. */
      level?: number;
      /** Oscillator shape; a sine when absent. */
      wave?: OscillatorType;
      /** A drum to synthesize instead of a pitched tone (the pitch is then only a fallback). */
      drum?: DrumVoice;
      /** An instrument to sound the note on instead of a bare oscillator (the wave is the fallback). */
      voice?: Voice;
    };

/** A held tone under the whole song: nothing, the key note, or the key note with its fifth. */
export type Drone = 'off' | 'root' | 'fifth' | 'octave' | 'tanpura';
export const DRONES: readonly Drone[] = ['off', 'root', 'fifth', 'octave', 'tanpura'];

export interface BackingOptions {
  /** A click on every beat (the count-in always clicks). */
  metronome: boolean;
  /** The target pitch as a quiet tone. */
  guideTone: boolean;
}

/**
 * The audible accompaniment as data, in SONG time: count-in clicks before 0,
 * optional beat clicks through the end, optional guide tones. Pure so it can
 * be tested; `playBacking` schedules it on the audio clock.
 */
export function planBacking(
  chart: Chart,
  { metronome, guideTone }: BackingOptions,
): BackingEvent[] {
  const events: BackingEvent[] = [];
  const spb = 60 / chart.meta.bpm;
  const { countInBeats } = chart.meta;
  for (let i = countInBeats; i >= 1; i--) {
    events.push({ kind: 'click', songTime: -i * spb, accent: i === countInBeats });
  }
  const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0);
  if (metronome) {
    for (let b = 0, t = 0; t <= end + spb / 2; b++, t = b * spb) {
      events.push({ kind: 'click', songTime: t, accent: b % (chart.meta.beatsPerBar ?? 4) === 0 });
    }
  }
  if (guideTone) {
    for (const n of chart.notes) {
      if (n.pitch !== undefined) {
        events.push({
          kind: 'tone',
          songTime: n.t,
          duration: Math.max(n.duration, 0.2),
          midi: n.pitch,
          voice: 'flute',
        });
      }
    }
  }
  return events.sort((a, b) => a.songTime - b.songTime);
}

/** What `playBacking` needs from a Web Audio context (so it can be tested with a fake). */
export interface AudioOut {
  readonly currentTime: number;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  readonly destination: AudioNode;
  /** With these (a real context has them) drums are synthesized; without, they are pitched ticks. */
  readonly sampleRate?: number;
  createBuffer?: BaseAudioContext['createBuffer'];
  createBufferSource?: BaseAudioContext['createBufferSource'];
  createBiquadFilter?: BaseAudioContext['createBiquadFilter'];
}

export interface BackingHandle {
  /** Silences everything still scheduled. */
  stop(): void;
}

/** The voices whose simultaneous notes are a chord struck by a hand. */
const STRUMMED: ReadonlySet<Voice> = new Set(['pluck', 'nylon', 'piano', 'pad']);

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Schedules the events on the audio clock using the song clock's mapping. Nothing is scheduled in the past. */
export function playBacking(
  ctx: AudioOut,
  clock: SongClock,
  events: readonly BackingEvent[],
): BackingHandle {
  const nodes: AudioScheduledSourceNode[] = [];
  const now = ctx.currentTime;
  let lastTime = Number.NaN;
  let chordIndex = 0;
  for (const e of events) {
    const at = clock.toSourceTime(e.songTime);
    if (at < now - 0.02) continue;
    if (e.kind === 'tone' && e.drum && canPlayDrums(ctx)) {
      nodes.push(...playDrum(ctx, e.drum, Math.max(at, now), e.level ?? 1));
      continue;
    }
    if (e.kind === 'tone' && e.voice && canPlayVoices(ctx)) {
      // the notes of a chord struck together are played a hair apart, as a hand would
      const together = e.songTime === lastTime && STRUMMED.has(e.voice);
      chordIndex = together ? chordIndex + 1 : 0;
      lastTime = e.songTime;
      nodes.push(
        ...playVoice(
          ctx as unknown as VoiceContext,
          e.voice,
          e.midi,
          Math.max(at, now) + chordIndex * 0.011,
          e.duration,
          e.level ?? 1,
        ),
      );
      continue;
    }
    lastTime = e.kind === 'tone' ? e.songTime : lastTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain).connect(ctx.destination);
    if (e.kind === 'click') {
      osc.frequency.value = e.accent ? 1500 : 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.35, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.start(at);
      osc.stop(at + 0.06);
    } else {
      osc.frequency.value = midiToHz(e.midi);
      if (e.wave) osc.type = e.wave;
      const peak = 0.16 * (e.level ?? 1);
      const end = at + e.duration;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(peak, at + 0.02);
      gain.gain.setValueAtTime(peak, Math.max(at + 0.02, end - 0.05));
      gain.gain.linearRampToValueAtTime(0.0001, end);
      osc.start(at);
      osc.stop(end + 0.02);
    }
    nodes.push(osc);
  }
  return {
    stop() {
      for (const o of nodes) {
        try {
          o.stop();
        } catch {
          // never started or already stopped
        }
      }
      nodes.length = 0;
    },
  };
}

/**
 * The key note a drone should hold for a song: its major `tonic`, or the relative minor's note when the
 * song ends there (`tonic` names the major key, so A minor carries a C tonic).
 */
export function droneKeyNote(chart: Chart): number {
  const tonic = chart.meta.tonic ?? 60;
  const last = [...chart.notes].reverse().find((n) => n.pitch !== undefined)?.pitch;
  const minor = tonic - 3;
  return last !== undefined && (((last - minor) % 12) + 12) % 12 === 0 ? minor : tonic;
}

/**
 * A drone for the whole song: the key note held low (in the octave from C3 to B3, below where the
 * detector listens) and, if asked, its fifth, as a pentatonic flute is traditionally played over.
 * `rootMidi` is the key note in any octave.
 */
export function planDrone(chart: Chart, rootMidi: number, drone: Drone): BackingEvent[] {
  if (drone === 'off') return [];
  // it starts with the count-in, so the key note is in the ear before the song begins
  const lead = (chart.meta.countInBeats * 60) / chart.meta.bpm;
  const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0) + 0.5;
  let low = rootMidi;
  while (low >= 60) low -= 12;
  while (low < 48) low += 12;
  const tone = (midi: number, level: number): BackingEvent => ({
    kind: 'tone',
    songTime: -lead,
    duration: end + lead,
    midi,
    level,
    wave: 'sine',
    voice: 'organ',
  });
  if (drone === 'tanpura') {
    // the drone of Indian classical music: the fifth, the key note twice and the low key note, plucked
    // in turn and left to ring, over and over (about one round every five seconds)
    const out: BackingEvent[] = [];
    const step = 1.25;
    const round: readonly [number, number][] = [
      [low + 7, 0.7],
      [low + 12, 0.8],
      [low + 12, 0.8],
      [low, 1],
    ];
    for (let t = -lead, i = 0; t < end; t += step, i++) {
      const [midi, level] = round[i % round.length]!;
      out.push({
        kind: 'tone',
        songTime: t,
        duration: step * 2.2,
        midi,
        level,
        wave: 'triangle',
        voice: 'tanpura',
      });
    }
    return out;
  }
  return [
    tone(low, 0.9),
    ...(drone === 'fifth' ? [tone(low + 7, 0.5)] : []),
    ...(drone === 'octave' ? [tone(low + 12, 0.45)] : []),
  ];
}

/** Everything audible under a song: clicks, guide tones, and optionally accompaniment, in song-time order. */
export function planAllBacking(
  chart: Chart,
  options: BackingOptions & {
    accompaniment?: AccompanimentLevel | 'off';
    drums?: DrumStyle;
    /** A drone and the key note (MIDI, any octave) it holds. */
    drone?: { type: Drone; root: number };
  },
): BackingEvent[] {
  const events = planBacking(chart, options);
  if (options.accompaniment && options.accompaniment !== 'off') {
    events.push(...planAccompaniment(chart, options.accompaniment));
  }
  if (options.drums) events.push(...planDrums(chart, options.drums));
  if (options.drone) events.push(...planDrone(chart, options.drone.root, options.drone.type));
  return events.sort((a, b) => a.songTime - b.songTime);
}

/** The drum that stands for each lane of a rhythm when it is played back to be heard. */
export const LANE_DRUM: Readonly<Record<string, DrumVoice>> = {
  kick: 'kick',
  snare: 'snare',
  hat: 'hat',
  clap: 'rim',
  tap: 'tomhigh',
  hit: 'rim',
};

/** A pitch for each lane of a rhythm, so it can be heard as ticks: low for a kick, high for a hat. */
export const LANE_PITCH: Readonly<Record<string, number>> = {
  kick: 43,
  snare: 57,
  hat: 80,
  clap: 69,
  tap: 62,
  hit: 66,
};

/** A rhythm as short ticks (one pitch per lane), to hear it before playing it back. */
export function rhythmTones(chart: Chart): Extract<BackingEvent, { kind: 'tone' }>[] {
  return chart.notes.map((n) => ({
    kind: 'tone' as const,
    songTime: n.t,
    duration: 0.09,
    midi: LANE_PITCH[n.lane ?? 'hit'] ?? 66,
    level: 1.6,
    wave: 'triangle' as const,
    drum: LANE_DRUM[n.lane ?? 'hit'] ?? ('rim' as const),
  }));
}

/**
 * Plays tones right away (a step of a beginner mode being sounded), `gap` seconds apart for a run of
 * them or all at once when `gap` is 0. Returns when the last one ends, on the audio clock.
 */
export function playTonesNow(
  ctx: AudioOut,
  tones: readonly {
    midi: number;
    duration: number;
    level?: number;
    wave?: OscillatorType;
    voice?: Voice;
    drum?: DrumVoice;
  }[],
  gap = 0,
): number {
  const clock = { toSourceTime: (t: number) => ctx.currentTime + 0.03 + t } as SongClock;
  const events: BackingEvent[] = tones.map((t, i) => ({
    kind: 'tone' as const,
    songTime: i * gap,
    duration: t.duration,
    midi: t.midi,
    ...(t.level === undefined ? {} : { level: t.level }),
    ...(t.wave === undefined ? {} : { wave: t.wave }),
    ...(t.voice === undefined ? {} : { voice: t.voice }),
    ...(t.drum === undefined ? {} : { drum: t.drum }),
  }));
  playBacking(ctx, clock, events);
  return (
    ctx.currentTime +
    0.03 +
    Math.max(0, ...events.map((e) => e.songTime + (e.kind === 'tone' ? e.duration : 0)))
  );
}
