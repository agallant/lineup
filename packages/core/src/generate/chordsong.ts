import { chartFromBeats, type BeatNote, type Chart } from '../chart';
import { UKULELE_CHORD_FRETS } from '../chords';
import { createRng, pick, type Rng } from './random';
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
  { name: 'C', chords: { I: 'C', ii: 'Dm', iii: 'Em', IV: 'F', V: 'G', V7: 'G7', vi: 'Am' } },
  { name: 'G', chords: { I: 'G', ii: 'Am', IV: 'C', V: 'D', V7: 'D7', vi: 'Em' } },
  { name: 'D', chords: { I: 'D', ii: 'Em', IV: 'G', V: 'A', V7: 'A7' } },
  { name: 'F', chords: { I: 'F', ii: 'Gm', iii: 'Am', IV: 'Bb', V: 'C', V7: 'C7', vi: 'Dm' } },
  { name: 'A', chords: { I: 'A', ii: 'Bm', IV: 'D', V: 'E', V7: 'E7', vi: 'F#m' } },
];

/** Four-bar progressions that most pop, folk and blues songs are built from. */
const PROGRESSIONS: readonly { id: string; chords: readonly string[]; easy: boolean }[] = [
  { id: 'I-IV-V-I', chords: ['I', 'IV', 'V', 'I'], easy: true },
  { id: 'I-V-vi-IV', chords: ['I', 'V', 'vi', 'IV'], easy: false },
  { id: 'I-vi-IV-V', chords: ['I', 'vi', 'IV', 'V'], easy: true },
  { id: 'ii-V-I-I', chords: ['ii', 'V', 'I', 'I'], easy: false },
  { id: 'I-I-IV-V', chords: ['I', 'I', 'IV', 'V'], easy: true },
  { id: 'vi-IV-I-V', chords: ['vi', 'IV', 'I', 'V'], easy: false },
  { id: 'I-IV-I-V', chords: ['I', 'IV', 'I', 'V'], easy: true },
];

/** One bar of strokes on an eighth-note grid: D down, U up, . nothing. */
const PATTERNS: Readonly<Record<MelodyLevel, { main: readonly string[]; fill: string }>> = {
  easy: { main: ['D . D . D . D .', 'D . . . D . . .'], fill: 'D . D . D . D .' },
  medium: { main: ['D . D U . U D U', 'D . . U . U D .'], fill: 'D . D U D U D U' },
  hard: {
    main: ['D . D U . U D U', 'D . . U . U D U', 'D U . U D U . U'],
    fill: 'D . D U D U D U',
  },
};

const BPM: Readonly<Record<MelodyLevel, number>> = { easy: 76, medium: 88, hard: 96 };

/** Four cycles of four bars: the same progression, or two that alternate (ABAB / AABA). */
const FORMS: Readonly<Record<MelodyLevel, readonly string[]>> = {
  easy: ['AAAA'],
  medium: ['AAAA', 'AABA'],
  hard: ['ABAB', 'AABA'],
};

/** One waltz bar on an eighth-note grid: a low stroke then two light ones. */
const WALTZ_PATTERNS: Readonly<Record<MelodyLevel, { main: readonly string[]; fill: string }>> = {
  easy: { main: ['D . . . . .', 'D . D . D .'], fill: 'D . D . D .' },
  medium: { main: ['D . D . D .', 'D . D U D .'], fill: 'D . D U D U' },
  hard: { main: ['D . D U D .', 'D . D U D U'], fill: 'D U D U D U' },
};

/** The chords in a progression for a key, or null if the key lacks one of them. */
function chordsFor(key: (typeof KEYS)[number], numerals: readonly string[]): string[] | null {
  const out: string[] = [];
  for (const n of numerals) {
    const chord = key.chords[n];
    if (!chord) return null;
    out.push(chord);
  }
  return out;
}

function pickProgression(
  rng: Rng,
  key: (typeof KEYS)[number],
  level: MelodyLevel,
  not?: string,
): { id: string; chords: string[] } {
  const options = PROGRESSIONS.filter(
    (p) => (level !== 'easy' || p.easy) && p.id !== not && chordsFor(key, p.chords) !== null,
  );
  const chosen = pick(rng, options);
  return { id: chosen.id, chords: chordsFor(key, chosen.chords)! };
}

/** The bars of a chord song: every chord and the progression it came from, for tests and titles. */
export function chordSongBars(spec: ChordSongSpec): {
  key: string;
  progressions: string[];
  bars: string[];
} {
  const rng = createRng(
    spec.seed * 6151 + MELODY_LEVELS.indexOf(spec.level) * 31 + (spec.waltz ? 11 : 7),
  );
  // the easy level stays in the two friendliest keys
  const key = pick(rng, spec.level === 'easy' ? KEYS.slice(0, 2) : KEYS);
  const a = pickProgression(rng, key, spec.level);
  const b = pickProgression(rng, key, spec.level, a.id);
  const form = pick(rng, FORMS[spec.level]);
  const bars: string[] = [];
  for (const letter of form) bars.push(...(letter === 'A' ? a : b).chords);
  // finish at home, approached from the dominant seventh where the key has one
  bars[bars.length - 1] = key.chords['I']!;
  const approach = key.chords['V7'];
  if (approach && spec.level !== 'easy') bars[bars.length - 2] = approach;
  return {
    key: key.name,
    progressions: [...new Set(form.split('').map((l) => (l === 'A' ? a : b).id))],
    bars,
  };
}

/**
 * A new chord song for the ukulele: sixteen bars from common progressions in a key where every
 * chord has a fingering, with a strum pattern that repeats and a variation at the end of each
 * four bars. The same spec always gives the same song.
 */
export function generateChordSong(spec: ChordSongSpec): Chart {
  const { key, progressions, bars } = chordSongBars(spec);
  const rng = createRng(spec.seed * 7211 + 13);
  const beatsPerBar = spec.waltz ? 3 : 4;
  const patterns = (spec.waltz ? WALTZ_PATTERNS : PATTERNS)[spec.level];
  const main = [...pick(rng, patterns.main).replace(/\s+/g, '')];
  const fill = [...patterns.fill.replace(/\s+/g, '')];
  const notes: BeatNote[] = [];
  bars.forEach((chord, bar) => {
    if (!UKULELE_CHORD_FRETS[chord]) throw new Error(`no ukulele fingering for chord "${chord}"`);
    // the last bar of every four (except the last of the song) turns round
    const steps = bar % 4 === 3 && spec.level !== 'easy' && bar !== bars.length - 1 ? fill : main;
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
      title: `Random ${spec.waltz ? 'waltz' : 'chord song'} ${spec.seed}: ${progressions.join(' / ')} in ${key}, ${spec.level}`,
      artist: 'Lineup',
      bpm: BPM[spec.level],
      instruments: ['ukulele-strum'],
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
