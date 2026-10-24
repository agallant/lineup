import {
  createRng,
  hashSeed,
  notePitch,
  parseChordName,
  pick,
  type Chart,
  type ChartNote,
  type Rng,
} from '@lineup/core';
import type { BackingEvent } from './backing';
import type { Voice } from './voices';

/**
 * What to play under a song. `bass` is a bass line; `full` the bass with chords held on top; the rest
 * are feels: `pad` (held chords), `arpeggio` and `lullaby` (broken chords), `waltz`, `boom-chick` and
 * `march` (a bass note and a chord on alternate beats), `walking` (a walking bass), `bossa` and `reggae`.
 * `auto` picks feels to suit the song (its meter, tempo and mood) and changes feel between sections.
 */
export type AccompanimentLevel =
  | 'bass'
  | 'full'
  | 'auto'
  | 'pad'
  | 'arpeggio'
  | 'lullaby'
  | 'waltz'
  | 'boom-chick'
  | 'march'
  | 'walking'
  | 'bossa'
  | 'reggae';

/** The feels, in menu order, with how each is described. */
export const ACCOMPANIMENT_FEELS: readonly { id: AccompanimentLevel; label: string }[] = [
  { id: 'auto', label: 'Match the song' },
  { id: 'bass', label: 'Bass line' },
  { id: 'full', label: 'Bass and chords' },
  { id: 'pad', label: 'Soft chords' },
  { id: 'arpeggio', label: 'Broken chords' },
  { id: 'lullaby', label: 'Lullaby (slow, gentle)' },
  { id: 'waltz', label: 'Waltz (oom-pah-pah)' },
  { id: 'boom-chick', label: 'Folk (boom-chick)' },
  { id: 'march', label: 'March' },
  { id: 'walking', label: 'Walking bass' },
  { id: 'bossa', label: 'Bossa nova' },
  { id: 'reggae', label: 'Reggae' },
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n: number): number => ((n % 12) + 12) % 12;

/** A chord to accompany with: its root as a pitch class, and whether it is minor or has a seventh. */
interface Harmony {
  root: number;
  minor: boolean;
  seventh: boolean;
  /** The semitones of the chord's notes above the root, when it is more than a plain triad or seventh. */
  tones?: readonly number[];
  /** The bass note's pitch class for a slash chord. */
  bass?: number;
}

/** Pitch classes of the chord's notes above the root. */
const intervals = (h: Harmony): number[] =>
  h.tones ? [...h.tones] : [0, h.minor ? 3 : 4, 7, ...(h.seventh ? [10] : [])];

/** The harmony a chord name such as "F#m", "Bb", "G7", "Dsus4" or "C/E" stands for, or null if it is not one. */
export function parseChord(name: string): Harmony | null {
  const c = parseChordName(name);
  if (!c) return null;
  const tones = c.quality.intervals;
  const plain = ['', 'm', '7', 'm7'].includes(c.quality.id);
  return {
    root: c.root,
    minor: tones.includes(3) && !tones.includes(4),
    seventh: tones.includes(10) || tones.includes(11),
    ...(plain ? {} : { tones }),
    ...(c.bass === null ? {} : { bass: c.bass }),
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

/** A short tone (a bass note, a chord stab) for the patterns. */
const tone = (
  songTime: number,
  duration: number,
  midi: number,
  level: number,
  wave: OscillatorType,
): BackingEvent => ({
  kind: 'tone',
  songTime,
  duration: Math.max(0.05, duration),
  midi,
  level,
  wave,
  voice: voiceFor(wave, duration),
});

/**
 * The instrument for a part: the low notes are a bass, the short notes of a pattern are plucked
 * strings, and a long soft chord is a pad. (The wave is what the pattern was written with.)
 */
function voiceFor(wave: OscillatorType, duration: number): Voice {
  if (wave === 'triangle') return 'bass';
  if (wave === 'square') return 'pluck';
  return duration >= 0.6 ? 'pad' : 'pluck';
}

/** The bass note and the notes of a chord, in the octaves the accompaniment plays in. */
const bassOf = (h: Harmony): number => inOctave(h.bass ?? h.root, 40);
/** The chord's fifth (perfect, flat or raised) at or above its bass note. */
const fifthOf = (h: Harmony): number =>
  inOctave(h.root + (intervals(h).find((iv) => iv >= 6 && iv <= 8) ?? 7), bassOf(h));
const triadOf = (h: Harmony, low = 55): number[] =>
  intervals(h).map((iv) => inOctave(h.root + iv, low));

/** Backing events for one chord held from `from` to `to` seconds (the original two feels). */
function chordEvents(
  h: Harmony,
  from: number,
  to: number,
  spb: number,
  level: AccompanimentLevel,
  beatsPerBar: number,
): BackingEvent[] {
  const events: BackingEvent[] = [];
  const bass = bassOf(h);
  const fifth = fifthOf(h);
  const length = to - from;
  // the root on the first beat, and the fifth half way through a longer bar
  const half = beatsPerBar >= 4 ? 2 : -1;
  const firstLen = half > 0 ? Math.min(length, spb * half) : length;
  events.push(tone(from, Math.max(0.2, firstLen * 0.9), bass, 1.5, 'triangle'));
  if (half > 0 && length > spb * half + 0.05) {
    events.push(
      tone(from + spb * half, Math.max(0.2, (length - spb * half) * 0.9), fifth, 1.2, 'triangle'),
    );
  }
  if (level === 'full') {
    for (const note of triadOf(h)) {
      events.push(tone(from, Math.max(0.3, length * 0.95), note, 0.45, 'sine'));
    }
  }
  return events;
}

/** What a pattern needs to know about the bar it plays. */
interface BarContext {
  h: Harmony;
  /** The chord of the next bar (for an approach note), if any. */
  next: Harmony | undefined;
  from: number;
  to: number;
  spb: number;
  perBar: number;
  /** The bar's place in the song, and whether it closes a four-bar phrase or the whole song. */
  index: number;
  phraseEnd: boolean;
  last: boolean;
  rng: Rng;
}

/** A note a half step below the next chord's root: the walking bass's way into the next bar. */
const approach = (c: BarContext): number => bassOf(c.next ?? c.h) - 1;

/** The notes of one bar in a feel. Each is quiet, made of oscillators, and sits below where voices sing. */
const FEELS: Readonly<Record<string, (c: BarContext) => BackingEvent[]>> = {
  pad: (c) => [
    tone(c.from, c.to - c.from, bassOf(c.h), 0.9, 'triangle'),
    ...triadOf(c.h).map((m) => tone(c.from, (c.to - c.from) * 0.97, m, 0.4, 'sine')),
  ],
  arpeggio: (c) => {
    // eighth notes up and down the chord: the root, third, fifth, octave, fifth, third...
    const notes = triadOf(c.h, 57);
    const cycle = [0, 1, 2, 3, 2, 1].map((i) => (i === 3 ? notes[0]! + 12 : notes[i]!));
    const steps = c.perBar * 2;
    const out: BackingEvent[] = [tone(c.from, c.spb * c.perBar * 0.9, bassOf(c.h), 1, 'triangle')];
    for (let i = 0; i < steps; i++) {
      out.push(tone(c.from + (i * c.spb) / 2, c.spb * 0.55, cycle[i % cycle.length]!, 0.5, 'sine'));
    }
    return out;
  },
  lullaby: (c) => {
    // the root on one, then the chord's notes climbing a beat at a time
    const notes = triadOf(c.h, 57);
    const out: BackingEvent[] = [tone(c.from, c.spb * 1.8, bassOf(c.h), 1.1, 'triangle')];
    for (let b = 1; b < c.perBar; b++) {
      out.push(tone(c.from + b * c.spb, c.spb * 1.5, notes[(b - 1) % notes.length]!, 0.45, 'sine'));
    }
    return out;
  },
  waltz: (c) => {
    // oom-pah-pah: the bass on one, the chord on the other beats
    const out: BackingEvent[] = [tone(c.from, c.spb * 0.9, bassOf(c.h), 1.5, 'triangle')];
    for (let b = 1; b < c.perBar; b++) {
      for (const m of triadOf(c.h)) out.push(tone(c.from + b * c.spb, c.spb * 0.3, m, 0.4, 'sine'));
    }
    return out;
  },
  'boom-chick': (c) => {
    // bass on one (the root) and three (the fifth), the chord on two and four
    const out: BackingEvent[] = [];
    for (let b = 0; b < c.perBar; b++) {
      const at = c.from + b * c.spb;
      if (b % 2 === 0) {
        const note = b === 0 ? bassOf(c.h) : fifthOf(c.h);
        out.push(tone(at, c.spb * 0.7, note, 1.4, 'triangle'));
      } else {
        for (const m of triadOf(c.h)) out.push(tone(at, c.spb * 0.25, m, 0.42, 'sine'));
      }
    }
    // the bar before a new phrase leans into the next chord
    if (c.phraseEnd && c.perBar >= 4) {
      out.push(tone(c.from + (c.perBar - 0.5) * c.spb, c.spb * 0.4, approach(c), 1.1, 'triangle'));
    }
    return out;
  },
  march: (c) => {
    const out: BackingEvent[] = [];
    for (let b = 0; b < c.perBar; b++) {
      const at = c.from + b * c.spb;
      if (b % 2 === 0)
        out.push(tone(at, c.spb * 0.4, b === 0 ? bassOf(c.h) : fifthOf(c.h), 1.6, 'triangle'));
      else for (const m of triadOf(c.h)) out.push(tone(at, c.spb * 0.18, m, 0.5, 'square'));
    }
    return out;
  },
  walking: (c) => {
    // a quarter note on each beat: root, third, fifth, then a step into the next chord
    const r = bassOf(c.h);
    const third = inOctave(c.h.root + (intervals(c.h)[1] ?? (c.h.minor ? 3 : 4)), r);
    const fifth = fifthOf(c.h);
    const line = [r, third, fifth, c.perBar >= 4 ? approach(c) : fifth];
    const out: BackingEvent[] = [];
    for (let b = 0; b < c.perBar; b++) {
      out.push(tone(c.from + b * c.spb, c.spb * 0.85, line[Math.min(b, 3)]!, 1.4, 'triangle'));
    }
    return out;
  },
  bossa: (c) => {
    // the bass on one and the "and" of two, three and the "and" of four; stabs in between
    const r = bassOf(c.h);
    const out: BackingEvent[] = [
      tone(c.from, c.spb * 1.4, r, 1.4, 'triangle'),
      tone(c.from + c.spb * 1.5, c.spb * 0.4, fifthOf(c.h), 1.2, 'triangle'),
    ];
    if (c.perBar >= 4) {
      out.push(
        tone(c.from + c.spb * 2, c.spb * 1.4, r, 1.4, 'triangle'),
        tone(c.from + c.spb * 3.5, c.spb * 0.4, fifthOf(c.h), 1.2, 'triangle'),
      );
    }
    for (const at of [1, 2.5]) {
      if (at >= c.perBar) continue;
      for (const m of triadOf(c.h))
        out.push(tone(c.from + at * c.spb, c.spb * 0.25, m, 0.4, 'sine'));
    }
    return out;
  },
  reggae: (c) => {
    // the chord on the offbeats (the skank), the bass on three
    const out: BackingEvent[] = [];
    for (let b = 0; b < c.perBar; b++) {
      for (const m of triadOf(c.h, 60))
        out.push(tone(c.from + (b + 0.5) * c.spb, c.spb * 0.22, m, 0.42, 'square'));
    }
    const at = Math.min(2, c.perBar - 1);
    out.push(tone(c.from + at * c.spb, c.spb * 1.6, bassOf(c.h), 1.5, 'triangle'));
    return out;
  },
};

/** The feels `auto` chooses between, by how the song moves. */
function autoFeels(
  chart: Chart,
  minor: boolean,
  rng: Rng,
): [AccompanimentLevel, AccompanimentLevel] {
  const bpm = chart.meta.bpm;
  if ((chart.meta.beatsPerBar ?? 4) === 3) {
    return bpm < 84
      ? [pick(rng, ['lullaby', 'arpeggio'] as const), 'waltz']
      : ['waltz', 'arpeggio'];
  }
  if (bpm < 76)
    return minor ? ['pad', 'lullaby'] : [pick(rng, ['arpeggio', 'pad', 'lullaby'] as const), 'pad'];
  if (bpm < 100)
    return [pick(rng, ['arpeggio', 'boom-chick', 'bass', 'walking'] as const), 'arpeggio'];
  if (bpm < 125)
    return [pick(rng, ['boom-chick', 'walking', 'arpeggio', 'full'] as const), 'boom-chick'];
  return [pick(rng, ['march', 'boom-chick', 'walking'] as const), 'boom-chick'];
}

/** A bar of the song to accompany: the chord and where it sounds. */
interface Section {
  h: Harmony;
  from: number;
  to: number;
}

/** Plays a list of bars in a feel (or, for `auto`, in feels that change every eight bars). */
function playBars(
  chart: Chart,
  bars: readonly Section[],
  level: AccompanimentLevel,
  seed: number,
): BackingEvent[] {
  const spb = 60 / chart.meta.bpm;
  const perBar = chart.meta.beatsPerBar ?? 4;
  const rng = createRng(seed);
  const minor = bars.length > 0 && bars[bars.length - 1]!.h.minor;
  const [main, alt] = level === 'auto' ? autoFeels(chart, minor, rng) : [level, level];
  const events: BackingEvent[] = [];
  bars.forEach((bar, index) => {
    // a long song changes feel every eight bars (A section, B section, ...)
    const section = level === 'auto' && bars.length >= 16 && Math.floor(index / 8) % 2 === 1;
    const feel = section ? alt : main;
    const last = index === bars.length - 1;
    const ctx: BarContext = {
      h: bar.h,
      next: bars[index + 1]?.h,
      from: bar.from,
      to: bar.to,
      spb,
      perBar,
      index,
      phraseEnd: index % 4 === 3 && !last,
      last,
      rng,
    };
    const pattern = FEELS[feel];
    // the last bar is the ending: a held root and chord, whatever the feel
    if (!pattern || last) {
      events.push(
        ...chordEvents(
          bar.h,
          bar.from,
          bar.to,
          spb,
          pattern ? 'full' : (feel as AccompanimentLevel),
          perBar,
        ),
      );
    } else {
      events.push(...pattern(ctx));
    }
  });
  return events;
}

/**
 * Quiet music to play along with, as data in song time. A chord song gets its own chords; a melody
 * is harmonised one bar at a time from the notes in each bar; a rhythm gets nothing (its clicks and
 * the player are enough). The result is merged with the click and guide tones by the caller. `seed`
 * (the song's title by default) decides what `auto` picks.
 */
export function planAccompaniment(
  chart: Chart,
  level: AccompanimentLevel,
  seed: number = hashSeed(chart.meta.title),
): BackingEvent[] {
  const spb = 60 / chart.meta.bpm;
  const beatsPerBar = chart.meta.beatsPerBar ?? 4;
  const barLen = spb * beatsPerBar;
  const chordNotes = chart.notes.filter((n) => n.expected?.chord !== undefined);
  const bars: Section[] = [];
  if (chordNotes.length > 0) {
    // a chord holds from the first stroke of it until the stroke that changes it
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
      const first = Math.floor((c.t + 1e-6) / barLen);
      for (let bar = first; bar * barLen < next - 1e-6; bar++) {
        // the first bar starts at the stroke that changes the chord, not at the bar line before it
        // (the chord before is still sounding until then)
        bars.push({ h, from: Math.max(bar * barLen, c.t), to: Math.min((bar + 1) * barLen, next) });
      }
    });
  } else {
    const pitched = chart.notes.flatMap((n) => {
      const pitch = notePitch(n);
      return pitch === null ? [] : [{ n, pitch }];
    });
    if (pitched.length === 0) return [];
    for (const { bar, chord } of harmonise(chart, pitched)) {
      bars.push({ h: chord, from: bar * barLen, to: (bar + 1) * barLen });
    }
  }
  return playBars(chart, bars, level, seed).sort((a, b) => a.songTime - b.songTime);
}
