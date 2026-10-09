import type { Chart, SongClock } from '@lineup/core';

export type BackingEvent =
  | { kind: 'click'; songTime: number; accent: boolean }
  | { kind: 'tone'; songTime: number; duration: number; midi: number };

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
      events.push({ kind: 'click', songTime: t, accent: b % 4 === 0 });
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
}

export interface BackingHandle {
  /** Silences everything still scheduled. */
  stop(): void;
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Schedules the events on the audio clock using the song clock's mapping. Nothing is scheduled in the past. */
export function playBacking(
  ctx: AudioOut,
  clock: SongClock,
  events: readonly BackingEvent[],
): BackingHandle {
  const nodes: OscillatorNode[] = [];
  const now = ctx.currentTime;
  for (const e of events) {
    const at = clock.toSourceTime(e.songTime);
    if (at < now - 0.02) continue;
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
      const end = at + e.duration;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
      gain.gain.setValueAtTime(0.16, Math.max(at + 0.02, end - 0.05));
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
