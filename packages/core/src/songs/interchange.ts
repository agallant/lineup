import { midiLabel } from '../notes';
import { parseNoteName } from './notation';

/**
 * Ways into and out of the melody notation of My songs: moving a melody to another key, and reading
 * a tune written in ABC notation (the plain-text format of tune books and folk-tune sites).
 */

/** Moves every note of a melody notation by `semitones`, leaving lengths, rests and bar lines alone. */
export function transposeNotation(text: string, semitones: number): string {
  return text.replace(/\S+/g, (token) => {
    if (token === '|') return token;
    const [name = '', length] = token.split(':') as [string, string?];
    if (name === 'r') return token;
    const moved = midiLabel(parseNoteName(name) + semitones);
    return length === undefined ? moved : `${moved}:${length}`;
  });
}

/** A tune read from ABC notation, ready to be a melody in My songs. */
export interface AbcTune {
  title: string;
  /** Beats (quarter notes) per minute. */
  bpm: number;
  /** The pitch class (0 = C ... 11 = B) of the major key holding the tune's notes. */
  key: number;
  /** The melody in the notation of {@link melodyNotes}. */
  notes: string;
  /** Words under the notes (ABC `w:` lines), syllables separated by spaces, or empty. */
  lyrics: string;
}

const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Sharps (positive) or flats (negative) in the key signature of the major key on each pitch class. */
const MAJOR_ACCIDENTALS: readonly number[] = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5];

/** Semitones from a mode's tonic up to the tonic of the major key with the same notes. */
const MODE_TO_MAJOR: Readonly<Record<string, number>> = {
  '': 0,
  maj: 0,
  ion: 0,
  m: 3,
  min: 3,
  aeo: 3,
  mix: 5,
  dor: 10,
  lyd: 7,
  phr: 8,
  loc: 1,
};

const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A length in quarter-note beats as notation text: "2", ".5" is written "1/2", a third "1/3". */
function beatsText(num: number, den: number): string {
  const g = gcd(num, den);
  const n = num / g;
  const d = den / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** The key and the accidentals it puts on each letter, from a `K:` field. */
function readKey(field: string): { key: number; signature: Map<string, number> } {
  const m = /^\s*([A-G])([#b]?)\s*([A-Za-z]*)/.exec(field);
  if (!m) throw new Error(`Cannot read the key "${field.trim()}" (try K:C or K:Gm).`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const tonic = (LETTER_PC[m[1]!]! + accidental + 12) % 12;
  const mode = m[3]!.toLowerCase().slice(0, 3);
  const shift = mode === 'm' || mode === 'min' ? 3 : MODE_TO_MAJOR[mode];
  if (shift === undefined) throw new Error(`Cannot read the mode "${m[3]}" in K:${field.trim()}.`);
  const key = (tonic + shift) % 12;
  const count = MAJOR_ACCIDENTALS[key]!;
  const signature = new Map<string, number>();
  const letters = count >= 0 ? SHARP_ORDER : FLAT_ORDER;
  for (const letter of letters.slice(0, Math.abs(count)))
    signature.set(letter, count >= 0 ? 1 : -1);
  return { key, signature };
}

/** A fraction such as "3/4", "1/8" or "4" from a header, as a number of whole notes. */
function fraction(text: string): number | null {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(text);
  if (!m) return null;
  const d = m[2] === undefined ? 1 : Number(m[2]);
  return d === 0 ? null : Number(m[1]) / d;
}

/**
 * Reads the first tune of ABC notation: the title, key, tempo, note lengths and the notes, with
 * accidentals from the key signature and the bar, ties, triplets, broken rhythm (`>` `<`) and the
 * `w:` words. Chords (`"G"`), decorations, grace notes, slurs and repeat marks are skipped; a
 * bracketed chord `[CEG]` keeps its top note. Throws a message in plain words when it cannot read it.
 */
export function parseAbc(text: string): AbcTune {
  let title = '';
  let key: { key: number; signature: Map<string, number> } | null = null;
  let unit: number | null = null;
  let meter = 1;
  let bpm = 100;
  const body: string[] = [];
  const words: string[] = [];
  let started = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/%.*$/, '').trim();
    if (line === '') {
      if (body.length > 0) break;
      continue;
    }
    const field = /^([A-Za-z]):\s*(.*)$/.exec(line);
    if (field && !started) {
      const [, f, value = ''] = field;
      if (f === 'T' && title === '') title = value.trim();
      else if (f === 'M') {
        meter = value.trim() === 'C' ? 1 : value.trim() === 'C|' ? 1 : (fraction(value) ?? 1);
      } else if (f === 'L') {
        unit = fraction(value);
        if (unit === null) throw new Error(`Cannot read the note length "L:${value.trim()}".`);
      } else if (f === 'Q') {
        const q = /^\s*(?:"[^"]*"\s*)?(?:(\d+)\s*\/\s*(\d+)\s*=\s*)?(\d+)/.exec(value);
        if (q) bpm = Number(q[3]) * (q[1] ? (Number(q[1]) / Number(q[2])) * 4 : 1);
      } else if (f === 'K') {
        key = readKey(value);
        started = true;
      }
      continue;
    }
    if (field && field[1] === 'X') break; // the next tune
    if (field && field[1] === 'w') {
      words.push(field[2] ?? '');
      continue;
    }
    if (field) continue; // other fields in the body (voices, inline headers on their own line)
    if (!started) throw new Error('Put a K: (key) line before the notes, for example K:C.');
    body.push(line);
  }
  if (!key) throw new Error('Put a K: (key) line before the notes, for example K:C.');
  if (body.length === 0) throw new Error('There are no notes after the K: line.');
  const quarter = unit ?? (meter < 0.75 ? 1 / 16 : 1 / 8);

  type Out = { pitch: number | null; num: number; den: number };
  const out: Out[] = [];
  let barAccidentals = new Map<string, number>();
  let tuplet: { left: number; scale: [number, number] } | null = null;
  let pendingBroken: { factor: [number, number] } | null = null;
  let tie = false;
  const src = body.join(' ');
  // a note's length: digits and slashes after it, in units of L:
  const lengthAt = (i: number): { num: number; den: number; end: number } => {
    const m = /^(\d*)(\/*)(\d*)/.exec(src.slice(i))!;
    const num = m[1] === '' ? 1 : Number(m[1]);
    let den = 1;
    const slashes = m[2]!.length;
    if (slashes > 0) den = m[3] !== '' && slashes === 1 ? Number(m[3]) : 2 ** slashes;
    if (den === 0) throw new Error(`Cannot read the note length "${m[0]}".`);
    return { num, den, end: i + m[0].length };
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '"') {
      i = src.indexOf('"', i + 1) + 1 || src.length; // a chord symbol
      continue;
    }
    if (ch === '!' || ch === '+') {
      const j = src.indexOf(ch, i + 1);
      i = j < 0 ? i + 1 : j + 1; // a decoration
      continue;
    }
    if (ch === '{') {
      const j = src.indexOf('}', i);
      i = j < 0 ? src.length : j + 1; // grace notes
      continue;
    }
    if (ch === '|' || ch === ':' || ch === ']' || (ch === '[' && /[|:]/.test(src[i + 1] ?? ''))) {
      if (ch === '|') barAccidentals = new Map();
      i++;
      continue;
    }
    if (ch === '[' && /\d/.test(src[i + 1] ?? '')) {
      i += 2; // a first or second ending: [1 [2
      continue;
    }
    if (ch === '[' && /^\[[A-Za-z]:/.test(src.slice(i, i + 3))) {
      const j = src.indexOf(']', i);
      i = j < 0 ? src.length : j + 1; // an inline field
      continue;
    }
    if (ch === '(' && /\d/.test(src[i + 1] ?? '')) {
      const n = Number(src[i + 1]);
      tuplet = { left: n, scale: [n === 3 ? 2 : n === 2 ? 3 : n === 4 ? 3 : 2, n] };
      i += 2;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ' ' || ch === '\\' || ch === '.' || ch === '~') {
      i++;
      continue;
    }
    if (ch === '-') {
      tie = true;
      i++;
      continue;
    }
    if (ch === '>' || ch === '<') {
      const count = /^[<>]+/.exec(src.slice(i))![0].length;
      const long: [number, number] = [2 ** (count + 1) - 1, 2 ** count];
      const short: [number, number] = [1, 2 ** count];
      // `A>B` lengthens the note before and shortens the next; `A<B` does the reverse
      const [before, after] = ch === '>' ? [long, short] : [short, long];
      const prev = out.at(-1);
      if (prev) {
        prev.num *= before[0];
        prev.den *= before[1];
      }
      pendingBroken = { factor: after };
      i += count;
      continue;
    }
    // a note, a rest, or a chord in brackets
    let j: number;
    let pitch: number | null;
    const readNote = (at: number): { pitch: number | null; end: number } => {
      let k = at;
      let acc: number | null = null;
      while (src[k] === '^' || src[k] === '_' || src[k] === '=') {
        const c = src[k]!;
        if (c === '=') acc = 0;
        else acc = (acc ?? 0) + (c === '^' ? 1 : -1);
        k++;
      }
      const letter = src[k];
      if (letter === undefined || !/[A-Ga-gzxZ]/.test(letter)) {
        throw new Error(`Cannot read "${src.slice(at, at + 6).trim()}" in the notes.`);
      }
      k++;
      if (/[zxZ]/.test(letter)) return { pitch: null, end: k };
      const upper = letter.toUpperCase();
      let octave = letter === upper ? 4 : 5;
      while (src[k] === "'" || src[k] === ',') {
        octave += src[k] === "'" ? 1 : -1;
        k++;
      }
      const id = `${upper}${octave}`;
      let shift: number;
      if (acc !== null) {
        barAccidentals.set(id, acc);
        shift = acc;
      } else shift = barAccidentals.get(id) ?? key!.signature.get(upper) ?? 0;
      return { pitch: LETTER_PC[upper]! + shift + 12 * (octave + 1), end: k };
    };
    if (ch === '[') {
      const close = src.indexOf(']', i);
      if (close < 0) throw new Error('A chord in [brackets] is not closed.');
      let k = i + 1;
      let top = -Infinity;
      while (k < close) {
        if (src[k] === ' ') {
          k++;
          continue;
        }
        const n = readNote(k);
        k = n.end;
        // lengths inside a chord belong to the notes; keep the pitch only
        const len = /^[\d/]*/.exec(src.slice(k, close))![0];
        k += len.length;
        if (n.pitch !== null && n.pitch > top) top = n.pitch;
      }
      pitch = Number.isFinite(top) ? top : null;
      j = close + 1;
    } else {
      const n = readNote(i);
      pitch = n.pitch;
      j = n.end;
    }
    const len = lengthAt(j);
    let { num, den } = len;
    j = len.end;
    if (pendingBroken) {
      num *= pendingBroken.factor[0];
      den *= pendingBroken.factor[1];
      pendingBroken = null;
    }
    if (tuplet) {
      num *= tuplet.scale[0];
      den *= tuplet.scale[1];
      if (--tuplet.left === 0) tuplet = null;
    }
    const prev = out.at(-1);
    if (tie && prev && prev.pitch === pitch && pitch !== null) {
      // a tied note continues the one before it
      prev.num = prev.num * den + num * prev.den;
      prev.den *= den;
    } else out.push({ pitch, num, den });
    tie = false;
    i = j;
  }
  if (!out.some((n) => n.pitch !== null))
    throw new Error('There are no notes to play in that tune.');
  const notes = out
    .map((n) => {
      // a note of L: units is `unit` of a whole note; a beat is a quarter note
      const beats = beatsText(n.num * Math.round(quarter * 4 * 1_000_000), n.den * 1_000_000);
      return `${n.pitch === null ? 'r' : midiLabel(n.pitch)}:${beats}`;
    })
    .join(' ');
  const lyrics = words
    .join(' ')
    .replace(/[-_*~|]/g, ' ')
    .split(/\s+/)
    .filter((w) => w !== '')
    .join(' ');
  return {
    title: title || 'Imported tune',
    bpm: Math.min(240, Math.max(30, Math.round(bpm))),
    key: key.key,
    notes,
    lyrics,
  };
}
