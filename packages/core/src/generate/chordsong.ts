import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { ukuleleHasChord } from '../chords';
import { createRng, pick, pickWeighted, type Rng } from './random';
import { isMelodyLevel, isSeed, MELODY_LEVELS, type MelodyLevel } from './melody';

/** A chord song to strum: a progression in a key, a strum pattern, and a turn at the end. */
export interface ChordSongSpec {
  seed: number;
  level: MelodyLevel;
  /** Three beats to the bar (a waltz) instead of four. */
  waltz?: boolean;
}

/** The chords of a major key by Roman numeral: only those with a ukulele fingering are listed. */
const KEYS: readonly { name: string; chords: Readonly<Record<string, string>> }[] = [
  {
    name: 'C',
    chords: { I: 'C', ii: 'Dm', iii: 'Em', IV: 'F', V: 'G', V7: 'G7', vi: 'Am', II7: 'D7' },
  },
  {
    name: 'G',
    chords: { I: 'G', ii: 'Am', iii: 'Bm', IV: 'C', V: 'D', V7: 'D7', vi: 'Em', II7: 'A7' },
  },
  {
    name: 'D',
    chords: { I: 'D', ii: 'Em', IV: 'G', V: 'A', V7: 'A7', vi: 'Bm', II7: 'E7' },
  },
  {
    name: 'F',
    chords: { I: 'F', ii: 'Gm', iii: 'Am', IV: 'Bb', V: 'C', V7: 'C7', vi: 'Dm', II7: 'G7' },
  },
  {
    name: 'A',
    chords: { I: 'A', ii: 'Bm', IV: 'D', V: 'E', V7: 'E7', vi: 'F#m', II7: 'B7' },
  },
];

/** The chords a beginner has met: the easy level keeps to these. */
const EASY_CHORDS: ReadonlySet<string> = new Set([
  'C',
  'G',
  'Am',
  'F',
  'D',
  'Em',
  'Dm',
  'A',
  'G7',
  'C7',
  'A7',
  'D7',
]);

/** The numerals a level draws on: the easy level keeps to the home chords, harder ones add colour. */
const NUMERALS: Readonly<Record<MelodyLevel, readonly string[]>> = {
  easy: ['I', 'IV', 'V', 'vi'],
  medium: ['I', 'ii', 'iii', 'IV', 'V', 'V7', 'vi'],
  hard: ['I', 'ii', 'iii', 'IV', 'V', 'V7', 'vi', 'II7'],
};

/**
 * Where each chord likes to go next, with how likely: this is the grammar of folk and pop (the
 * subdominant leads to the dominant, the dominant home, a secondary dominant resolves to the
 * dominant) and what keeps a random progression sounding like a song instead of a shuffle.
 */
const NEXT: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  I: { IV: 30, V: 20, vi: 22, ii: 10, iii: 5, I: 8 },
  ii: { V: 40, V7: 25, IV: 10, vi: 5 },
  iii: { vi: 35, IV: 30, ii: 10 },
  IV: { I: 28, V: 28, V7: 8, ii: 10, vi: 10, IV: 3 },
  V: { I: 45, vi: 20, IV: 14 },
  V7: { I: 55, vi: 20, IV: 8 },
  vi: { IV: 30, ii: 22, V: 14, I: 10, iii: 6 },
  II7: { V: 55, V7: 20 },
};

/** The phrase forms of sixteen bars. A is stated; A' repeats it but closes at home; B contrasts; C is new. */
const FORMS: Readonly<Record<MelodyLevel, readonly string[]>> = {
  easy: ['AaBa', 'ABAa', 'AaBC'],
  medium: ['AaBC', 'ABaC', 'AaBa', 'ABAC'],
  hard: ['ABaC', 'ABCa', 'AaBC', 'ABAC'],
};

/** One bar of strokes on an eighth-note grid: D down, U up, . nothing. */
const PATTERNS: Readonly<Record<MelodyLevel, { main: readonly string[]; fill: string }>> = {
  easy: {
    main: ['D . D . D . D .', 'D . . . D . . .', 'D . D . D . . .', 'D . . . D . D .'],
    fill: 'D . D . D . D .',
  },
  medium: {
    main: ['D . D U . U D U', 'D . . U . U D .', 'D . D . D U D .', 'D . D U D . D U'],
    fill: 'D . D U D U D U',
  },
  hard: {
    main: ['D . D U . U D U', 'D . . U . U D U', 'D U . U D U . U', 'D . D U . U D .'],
    fill: 'D . D U D U D U',
  },
};

const BPM: Readonly<Record<MelodyLevel, number>> = { easy: 76, medium: 88, hard: 96 };

/** One waltz bar on an eighth-note grid: a low stroke then two light ones. */
const WALTZ_PATTERNS: Readonly<Record<MelodyLevel, { main: readonly string[]; fill: string }>> = {
  easy: {
    main: ['D . . . . .', 'D . D . D .', 'D . . . D .', 'D . D . . .'],
    fill: 'D . D . D .',
  },
  medium: {
    main: ['D . D . D .', 'D . D U D .', 'D . . U D .', 'D . D . D U'],
    fill: 'D . D U D U',
  },
  hard: {
    main: ['D . D U D .', 'D . D U D U', 'D . . U D U', 'D U D . D U'],
    fill: 'D U D U D U',
  },
};

/**
 * Four bars of chords as numerals, starting on `first` and finishing on `last`, walking by the
 * grammar in {@link NEXT}: no chord for more than two bars, and (above the easy level) at least
 * three different chords so the phrase goes somewhere.
 */
function walkPhrase(
  rng: Rng,
  allowed: readonly string[],
  first: string,
  last: string,
  level: MelodyLevel,
): string[] {
  const minDistinct = level === 'easy' ? 2 : 3;
  let fallback: string[] = [first, first, first, last];
  for (let attempt = 0; attempt < 60; attempt++) {
    const bars = [first];
    for (let i = 1; i < 3; i++) {
      const prev = bars[i - 1]!;
      const options = Object.entries(NEXT[prev] ?? {})
        .filter(([n]) => allowed.includes(n))
        .map(([item, weight]) => ({ item, weight }));
      if (options.length === 0) break;
      bars.push(pickWeighted(rng, options));
    }
    if (bars.length < 3) continue;
    bars.push(last);
    const runs = bars.every((n, i) => i < 2 || !(n === bars[i - 1] && n === bars[i - 2]));
    const distinct = new Set(bars).size;
    // the bar before the cadence has to lead to it
    const leads = (NEXT[bars[2]!]?.[last] ?? 0) > 0;
    if (runs && leads && distinct >= minDistinct) return bars;
    if (runs && (leads || bars[2] === last)) fallback = bars;
  }
  return fallback;
}

/** The chords a key can play at a level, as numerals: those the key has (and a beginner knows). */
function allowedNumerals(key: (typeof KEYS)[number], level: MelodyLevel): string[] {
  return NUMERALS[level].filter((n) => {
    const chord = key.chords[n];
    return chord !== undefined && (level !== 'easy' || EASY_CHORDS.has(chord));
  });
}

/** The bars of a chord song: every chord, the key and the form, for tests and titles. */
export function chordSongBars(spec: ChordSongSpec): {
  key: string;
  /** The four-bar phrases as numerals ("I-vi-IV-V"), each different phrase once. */
  progressions: string[];
  /** The phrase letters in order: "AaBa" (a lower-case letter is the phrase again, closing at home). */
  form: string;
  bars: string[];
} {
  const rng = createRng(
    spec.seed * 6151 + MELODY_LEVELS.indexOf(spec.level) * 31 + (spec.waltz ? 11 : 7),
  );
  // the easy level stays in the friendliest keys
  const key = pick(rng, spec.level === 'easy' ? KEYS.filter((k) => 'CGD'.includes(k.name)) : KEYS);
  const allowed = allowedNumerals(key, spec.level);
  const form = pick(rng, FORMS[spec.level]);
  // the contrast phrase often starts away from home; a closing phrase ends at home
  const contrastStart = pickWeighted(
    rng,
    allowed.filter((n) => ['IV', 'vi', 'ii'].includes(n)).map((item) => ({ item, weight: 1 })),
  );
  const halfCadence = allowed.includes('V') ? 'V' : 'IV';
  let numerals: string[][] = [];
  // build the phrases; if a chord would be held three bars across a phrase boundary, build again
  for (let attempt = 0; attempt < 30; attempt++) {
    const phrases = new Map<string, string[]>();
    numerals = [];
    for (const letter of form) {
      let phrase: string[];
      if (letter === 'a' && phrases.has('A')) {
        // the first phrase again, but closing at home
        phrase = [...phrases.get('A')!.slice(0, 3), 'I'];
      } else if (phrases.has(letter)) {
        phrase = phrases.get(letter)!;
      } else if (letter === 'A') {
        phrase = walkPhrase(rng, allowed, 'I', halfCadence, spec.level);
      } else if (letter === 'B') {
        phrase = walkPhrase(rng, allowed, contrastStart, halfCadence, spec.level);
      } else {
        // C: a fresh phrase that heads home
        const start = pick(
          rng,
          allowed.filter((n) => n !== 'II7' && n !== 'V7'),
        );
        phrase = walkPhrase(rng, allowed, start, 'I', spec.level);
      }
      phrases.set(letter, phrase);
      numerals.push(phrase);
    }
    const flat = numerals.flat();
    if (!flat.some((n, i) => i >= 2 && n === flat[i - 1] && n === flat[i - 2])) break;
  }
  const bars = numerals.flat().map((n) => key.chords[n]!);
  // finish at home, approached from the dominant seventh where the key has one
  bars[bars.length - 1] = key.chords['I']!;
  const approach = key.chords['V7'];
  if (approach && spec.level !== 'easy') bars[bars.length - 2] = approach;
  return {
    key: key.name,
    progressions: [...new Set(numerals.map((p) => p.join('-')))],
    form,
    bars,
  };
}

/**
 * A new chord song for the ukulele: sixteen bars in a key where every chord has a fingering. The
 * progression is walked fresh from a grammar of chord movement (so two seeds rarely share one),
 * arranged in phrases such as AaBa, with a strum pattern for the song, another for its contrast
 * phrase at the harder levels, and a turnaround at the end of each four bars. The same spec always
 * gives the same song.
 */
export function generateChordSong(spec: ChordSongSpec): Chart {
  const { key, progressions, form, bars } = chordSongBars(spec);
  const rng = createRng(spec.seed * 7211 + 13);
  const beatsPerBar = spec.waltz ? 3 : 4;
  const patterns = (spec.waltz ? WALTZ_PATTERNS : PATTERNS)[spec.level];
  const compact = (text: string): string[] => [...text.replace(/\s+/g, '')];
  const main = compact(pick(rng, patterns.main));
  const alternative = compact(pick(rng, patterns.main));
  const fill = compact(patterns.fill);
  const notes: BeatNote[] = [];
  bars.forEach((chord, bar) => {
    if (!ukuleleHasChord(chord)) throw new Error(`no ukulele fingering for chord "${chord}"`);
    // the contrast phrase takes the other pattern at the harder levels
    const letter = form[Math.floor(bar / 4)]!;
    const base = spec.level !== 'easy' && letter === 'B' ? alternative : main;
    // the last bar of every four (except the last of the song) turns round
    const steps = bar % 4 === 3 && spec.level !== 'easy' && bar !== bars.length - 1 ? fill : base;
    // a stroke squeezed in just before a chord change rings into the next one: leave it out
    const changes = bars[bar + 1] !== undefined && bars[bar + 1] !== chord;
    steps.forEach((step, i) => {
      if (step === '.' || (changes && i === steps.length - 1)) return;
      const direction = step === 'D' ? 'down' : 'up';
      notes.push({
        beat: bar * beatsPerBar + i / 2,
        lane: direction,
        expected: { chord, direction },
      });
    });
  });
  // the song ends on a single held downstroke on the home chord
  const lastBar = bars.length - 1;
  const home = bars[lastBar]!;
  while (notes.length && notes[notes.length - 1]!.beat >= lastBar * beatsPerBar) notes.pop();
  notes.push({
    beat: lastBar * beatsPerBar,
    lane: 'down',
    expected: { chord: home, direction: 'down' },
  });
  return chartFromBeats(
    {
      title: `Random ${spec.waltz ? 'waltz' : 'chord song'} ${spec.seed}: ${progressions[0]}… in ${key}, ${spec.level}`,
      artist: 'Lineup',
      bpm: BPM[spec.level],
      instruments: ['ukulele-strum'],
      ...(spec.waltz ? { beatsPerBar: 3 } : {}),
    },
    notes,
  );
}

/** The id a generated chord song is stored and scored under: `gen-chords-<level>-<seed>` (`gen-waltz-` for a waltz). */
export const chordSongId = (spec: ChordSongSpec): string =>
  `gen-${spec.waltz ? 'waltz' : 'chords'}-${spec.level}-${spec.seed}`;

const CHORD_ID = /^gen-(chords|waltz)-(easy|medium|hard)-(0|[1-9]\d{0,4})$/;

/** The spec an id names, or null if it is not a generated chord song's id. */
export function parseChordSongId(id: string): ChordSongSpec | null {
  const m = CHORD_ID.exec(id);
  if (!m) return null;
  const level = m[2];
  const seed = Number(m[3]);
  if (!isMelodyLevel(level) || !isSeed(seed)) return null;
  return m[1] === 'waltz' ? { seed, level, waltz: true } : { seed, level };
}
