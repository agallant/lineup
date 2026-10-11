import type { PlayOutcome } from '../progress';

/** A short celebration as notes: MIDI pitch, start (seconds from now) and length. */
export type Jingle = readonly { midi: number; at: number; length: number }[];

export type JingleKind = 'level-up' | 'trophy' | 'daily' | 'new-best';

const JINGLES: Readonly<Record<JingleKind, Jingle>> = {
  // a rising major arpeggio with a held top note
  'level-up': [
    { midi: 72, at: 0, length: 0.14 },
    { midi: 76, at: 0.14, length: 0.14 },
    { midi: 79, at: 0.28, length: 0.14 },
    { midi: 84, at: 0.42, length: 0.6 },
  ],
  trophy: [
    { midi: 79, at: 0, length: 0.12 },
    { midi: 84, at: 0.12, length: 0.12 },
    { midi: 88, at: 0.24, length: 0.5 },
  ],
  daily: [
    { midi: 72, at: 0, length: 0.12 },
    { midi: 79, at: 0.12, length: 0.35 },
  ],
  'new-best': [
    { midi: 76, at: 0, length: 0.12 },
    { midi: 83, at: 0.12, length: 0.35 },
  ],
};

/** The jingle for a finished song, or null: a level up beats a trophy, then a daily, then a new best. */
export function jingleFor(outcome: PlayOutcome | null, newBest: boolean): JingleKind | null {
  if (outcome?.leveledUp) return 'level-up';
  if (outcome && outcome.newAchievements.length > 0) return 'trophy';
  if (outcome && outcome.dailyBonus > 0) return 'daily';
  return newBest ? 'new-best' : null;
}

/** The notes of a jingle. */
export const jingleNotes = (kind: JingleKind): Jingle => JINGLES[kind];

/** What playing a jingle needs from an audio context. */
export interface JingleOut {
  readonly currentTime: number;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  readonly destination: AudioNode;
}

/** Plays a jingle softly on the audio output. */
export function playJingle(ctx: JingleOut, kind: JingleKind): void {
  const t0 = ctx.currentTime + 0.05;
  for (const n of JINGLES[kind]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 440 * 2 ** ((n.midi - 69) / 12);
    osc.connect(gain).connect(ctx.destination);
    const start = t0 + n.at;
    const end = start + n.length;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}
