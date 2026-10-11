import { notePitch, type Chart, type ChartNote } from '@lineup/core';
import type { BackingEvent } from './backing';

/** How much music to play under a song: a bass line, or the bass with chords on top. */
export type AccompanimentLevel = 'bass' | 'full';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** A chord to accompany with: its root as a pitch class, and whether it is minor or has a seventh. */
interface Harmony {
  root: number;
  minor: boolean;
  seventh: boolean;
}

/** Pitch classes of the chord's notes above the root. */
const intervals = (h: Harmony): number[] => [0, h.minor ? 3 : 4, 7, ...(h.seventh ? [10] : [])];

const NAMES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** The harmony a chord name such as "F#m", "Bb" or "G7" stands for, or null if it is not one. */
export function parseChord(name: string): Harmony | null {
  const m = /^([A-G])([#b]?)(m(?!aj))?(7)?$/.exec(name);
  if (!m) return null;
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return {
    root: mod12(NAMES[m[1]!]! + accidental),
    minor: m[3] !== undefined,
    seventh: m[4] !== undefined,
  };
}

/** The triads of a major key a tune is harmonised with: I, ii, iii, IV, V and vi. */
const KEY_CHORDS: readonly Harmony[] = [
  { root: 0, minor: false, seventh: false },
  { root: 2, minor: true, seventh: false },
  { root: 4, minor: true, seventh: false },
  { root: 5, minor: false, seventh: false },
  { root: 7, minor: false, seventh: false },
  { root: 9, minor: true, seventh: false },
];

/** How common each chord of the key is (by its root's distance from the tonic), 1 for the commonest. */
const FAMILIARITY: Readonly<Record<number, number>> = {
  0: 1,
  5: 0.97,
  7: 1,
  9: 0.95,
  2: 0.92,
  4: 0.85,
};

/** A bar of a melody: the pitch classes sounding in it, weighted by length and by the downbeat. */
function weights(
  notes: readonly { n: ChartNote; pitch: number }[],
  start: number,
  end: number,
  spb: number,
) {
  const w = new Array<number>(12).fill(0);
  for (const { n, pitch } of notes) {
    if (n.t < start - 1e-6 || n.t >= end - 1e-6) continue;
    const len = Math.min(Math.max(n.duration, spb * 0.5), spb * 2);
    w[mod12(pitch)]! += len * (n.t - start < spb * 0.5 ? 1.5 : 1);
  }
  return w;
}

/** The major key (a pitch class) that holds most of these pitches, when the chart does not say. */
function bestKey(pitches: readonly number[]): number {
  let best = 0;
  let bestHits = -1;
  for (let k = 0; k < 12; k++) {
    const hits = pitches.filter((p) => MAJOR.includes(mod12(p - k))).length;
    if (hits > bestHits) {
      best = k;
      bestHits = hits;
    }
  }
  return best;
}

/** One chord for each bar of a melody, chosen from the key's chords by which one fits the bar's notes best. */
function harmonise(
  chart: Chart,
  pitched: { n: ChartNote; pitch: number }[],
): { bar: number; chord: Harmony }[] {
  const spb = 60 / chart.meta.bpm;
  const barLen = spb * (chart.meta.beatsPerBar ?? 4);
  const key = mod12(chart.meta.tonic ?? bestKey(pitched.map((p) => p.pitch)));
  const last = pitched.at(-1)!;
  const bars = Math.floor((last.n.t + 1e-6) / barLen) + 1;
  const out: { bar: number; chord: Harmony }[] = [];
  let previous: Harmony | undefined;
  for (let bar = 0; bar < bars; bar++) {
    const w = weights(pitched, bar * barLen, (bar + 1) * barLen, spb);
    const total = w.reduce((a, b) => a + b, 0);
    let chosen = previous ?? { ...KEY_CHORDS[0]!, root: key };
    if (total > 0) {
      let bestScore = -1;
      for (const c of KEY_CHORDS) {
        const root = mod12(key + c.root);
        const chord = { ...c, root };
        let score = 0;
        intervals(chord).forEach((iv, i) => {
          score += w[mod12(root + iv)]! * (i === 0 ? 1.25 : 1);
        });
        // the common chords are likelier than ii and iii, and a chord that holds from the bar before
        // sounds steadier than one that changes
        score *= FAMILIARITY[c.root] ?? 1;
        if (previous && previous.root === root && previous.minor === c.minor) score += total * 0.15;
        if (c.root === 0) score += total * 0.05;
        if (score > bestScore) {
          bestScore = score;
          chosen = chord;
        }
      }
    }
    // the song ends at home
    if (bar === bars - 1 && w[mod12(key)]! > 0)
      chosen = { root: key, minor: false, seventh: false };
    out.push({ bar, chord: chosen });
    previous = chosen;
  }
  return out;
}

/** A MIDI note for a pitch class within an octave starting at `low`. */
const inOctave = (pc: number, low: number): number => low + mod12(pc - low);

/** Backing events for one chord held from `from` to `to` seconds. */
function chordEvents(
  h: Harmony,
  from: number,
  to: number,
  spb: number,
  level: AccompanimentLevel,
  beatsPerBar: number,
): BackingEvent[] {
  const events: BackingEvent[] = [];
  const bass = inOctave(h.root, 40);
  const fifth = bass + 7;
  const length = to - from;
  // the root on the first beat, and the fifth half way through a longer bar
  const half = beatsPerBar >= 4 ? 2 : -1;
  const firstLen = half > 0 ? Math.min(length, spb * half) : length;
  events.push({
    kind: 'tone',
    songTime: from,
    duration: Math.max(0.2, firstLen * 0.9),
    midi: bass,
    level: 1.5,
    wave: 'triangle',
  });
  if (half > 0 && length > spb * half + 0.05) {
    events.push({
      kind: 'tone',
      songTime: from + spb * half,
      duration: Math.max(0.2, (length - spb * half) * 0.9),
      midi: fifth,
      level: 1.2,
      wave: 'triangle',
    });
  }
  if (level === 'full') {
    for (const iv of intervals(h)) {
      events.push({
        kind: 'tone',
        songTime: from,
        duration: Math.max(0.3, length * 0.95),
        midi: inOctave(h.root + iv, 55),
        level: 0.45,
        wave: 'sine',
      });
    }
  }
  return events;
}

/**
 * Quiet music to play along with, as data in song time. A chord song gets its own chords; a melody
 * is harmonised one bar at a time from the notes in each bar; a rhythm gets nothing (its clicks and
 * the player are enough). The result is merged with the click and guide tones by the caller.
 */
export function planAccompaniment(chart: Chart, level: AccompanimentLevel): BackingEvent[] {
  const spb = 60 / chart.meta.bpm;
  const beatsPerBar = chart.meta.beatsPerBar ?? 4;
  const chordNotes = chart.notes.filter((n) => n.expected?.chord !== undefined);
  if (chordNotes.length > 0) {
    // a chord holds from the first stroke of it until the stroke that changes it
    const events: BackingEvent[] = [];
    const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0) + spb;
    const changes: { t: number; chord: string }[] = [];
    for (const n of chordNotes) {
      const chord = n.expected!.chord!;
      if (changes.at(-1)?.chord !== chord) changes.push({ t: n.t, chord });
    }
    changes.forEach((c, i) => {
      const h = parseChord(c.chord);
      if (!h) return;
      const next = changes[i + 1]?.t ?? end;
      // played a bar at a time from the bar line the stroke belongs to, so the bass keeps the beat
      const barLen = spb * beatsPerBar;
      const first = Math.floor((c.t + 1e-6) / barLen);
      for (let bar = first; bar * barLen < next - 1e-6; bar++) {
        events.push(
          // the first bar starts at the stroke that changes the chord, not at the bar line before it
          // (the chord before is still sounding until then)
          ...chordEvents(
            h,
            Math.max(bar * barLen, c.t),
            Math.min((bar + 1) * barLen, next),
            spb,
            level,
            beatsPerBar,
          ),
        );
      }
    });
    return events.sort((a, b) => a.songTime - b.songTime);
  }
  const pitched = chart.notes.flatMap((n) => {
    const pitch = notePitch(n);
    return pitch === null ? [] : [{ n, pitch }];
  });
  if (pitched.length === 0) return [];
  const barLen = spb * beatsPerBar;
  const bars = harmonise(chart, pitched);
  const events: BackingEvent[] = [];
  // consecutive bars on one chord are played as separate bars so the bass keeps the beat
  for (const { bar, chord } of bars) {
    events.push(...chordEvents(chord, bar * barLen, (bar + 1) * barLen, spb, level, beatsPerBar));
  }
  return events.sort((a, b) => a.songTime - b.songTime);
}
