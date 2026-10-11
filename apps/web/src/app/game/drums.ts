import type { Chart } from '@lineup/core';
import type { BackingEvent } from './backing';

/** A drum pattern played quietly under a song. */
export type DrumStyle = 'off' | 'rock' | 'bossa';
export const DRUM_STYLES: readonly DrumStyle[] = ['off', 'rock', 'bossa'];

/** Pitches (MIDI) standing in for the drums: oscillators only, so a kick is a low thud and a hat a high tick. */
const KICK = 36;
const SNARE = 62;
const HAT = 96;

const drum = (songTime: number, midi: number, duration: number, level: number): BackingEvent => ({
  kind: 'tone',
  songTime,
  duration,
  midi,
  level,
  wave: midi === HAT || midi === SNARE ? 'square' : 'triangle',
});

/** The eighth notes (0 to 15, over two bars of four) where bossa nova's syncopated tick falls. */
const BOSSA_TICKS: ReadonlySet<number> = new Set([0, 3, 6, 10, 12]);

/**
 * A drum loop for the whole song, in song time. Rock: kick on 1 and 3, snare on 2 and 4, hat on the
 * eighths. Bossa: a steady kick on every beat with a syncopated rim. A bar of three (a waltz) gets
 * a kick on one and a hat on two and three, in either style.
 */
export function planDrums(chart: Chart, style: DrumStyle): BackingEvent[] {
  if (style === 'off') return [];
  const spb = 60 / chart.meta.bpm;
  const perBar = chart.meta.beatsPerBar ?? 4;
  const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0);
  const events: BackingEvent[] = [];
  const beats = Math.ceil(end / spb);
  for (let b = 0; b < beats; b++) {
    const t = b * spb;
    const inBar = b % perBar;
    if (perBar === 3) {
      if (inBar === 0) events.push(drum(t, KICK, 0.12, 2.2));
      else events.push(drum(t, HAT, 0.04, 0.5));
      continue;
    }
    if (style === 'rock') {
      if (inBar === 0 || inBar === 2) events.push(drum(t, KICK, 0.12, 2.2));
      if (inBar === 1 || inBar === 3) events.push(drum(t, SNARE, 0.06, 0.9));
      events.push(drum(t, HAT, 0.04, 0.5), drum(t + spb / 2, HAT, 0.04, 0.35));
    } else {
      events.push(drum(t, KICK, 0.12, 2.0));
      const e = (b % (perBar * 2)) * 2; // this beat's first eighth, counted over two bars
      if (BOSSA_TICKS.has(e)) events.push(drum(t, HAT, 0.05, 0.6));
      if (BOSSA_TICKS.has(e + 1)) events.push(drum(t + spb / 2, HAT, 0.05, 0.6));
    }
  }
  return events;
}
