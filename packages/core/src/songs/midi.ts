import type { Chart } from '../chart';
import { chordFrets } from '../chords';
import { guitarOpenFor } from '../guitar';
import { midiLabel } from '../notes';

/**
 * Standard MIDI files in and out: a chart written as a MIDI file (to open in a notation or music
 * program), and a MIDI file read back as the tracks and notes it holds, ready to become a song.
 */

/** Ticks to a quarter note in the files written here. */
const PPQ = 480;

/** GM percussion notes (channel 10) for the lanes of the drum kit, hands and claps. */
const DRUM_NOTES: Readonly<Record<string, number>> = {
  kick: 36,
  snare: 38,
  hat: 42,
  clap: 39,
  tap: 37,
  hit: 39,
};

/** The lane a GM percussion note belongs to on a drum kit. */
const KIT_LANE_OF: Readonly<Record<number, string>> = {
  35: 'kick',
  36: 'kick',
  37: 'snare',
  38: 'snare',
  39: 'snare',
  40: 'snare',
  42: 'hat',
  44: 'hat',
  46: 'hat',
  49: 'hat',
  51: 'hat',
  53: 'hat',
  59: 'hat',
};

const UKULELE_OPEN = [67, 60, 64, 69] as const;

// ---------------------------------------------------------------------------------------- writing

const u16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v: number): number[] => [
  (v >>> 24) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 8) & 0xff,
  v & 0xff,
];

/** A variable-length quantity, the way MIDI writes times. */
function vlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}

interface Event {
  tick: number;
  /** Note-offs sort before note-ons at the same tick so repeated notes do not run together. */
  order: number;
  bytes: number[];
}

/** UTF-8 bytes of a string (the core package has no TextEncoder to lean on). */
function text(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
  }
  return out;
}

/** A string from UTF-8 bytes; bytes that are not valid UTF-8 are read as Latin-1, as old files use. */
function untext(data: Uint8Array): string {
  let out = '';
  for (let i = 0; i < data.length;) {
    const b = data[i]!;
    const len = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    const ok =
      len > 1 &&
      i + len <= data.length &&
      [...data.subarray(i + 1, i + len)].every((x) => (x & 0xc0) === 0x80);
    if (len === 1 || !ok) {
      out += String.fromCharCode(b);
      i++;
      continue;
    }
    let c = b & (0xff >> (len + 1));
    for (let k = 1; k < len; k++) c = (c << 6) | (data[i + k]! & 0x3f);
    out += String.fromCodePoint(c);
    i += len;
  }
  return out;
}

/** The notes a chart note sounds: its pitch, a ukulele chord's four strings, or one drum. */
function soundingNotes(
  n: Chart['notes'][number],
  guitarProfile: string | undefined,
): { pitches: number[]; drum: boolean } | null {
  if (n.pitch !== undefined) return { pitches: [n.pitch], drum: false };
  const open: readonly number[] = guitarOpenFor(guitarProfile) ?? UKULELE_OPEN;
  const frets = n.expected?.frets;
  if (frets && frets.length === open.length) {
    const held = frets.flatMap((f, i) => (f === null ? [] : [open[i]! + f]));
    if (held.length > 0) return { pitches: held, drum: false };
  }
  const chord = n.expected?.chord;
  const held = chord === undefined ? null : chordFrets(guitarProfile, chord);
  if (held) {
    const pitches = held.flatMap((f, i) => (f === null ? [] : [open[i]! + f]));
    return { pitches, drum: false };
  }
  if (n.lane !== undefined && Object.hasOwn(DRUM_NOTES, n.lane)) {
    return { pitches: [DRUM_NOTES[n.lane]!], drum: true };
  }
  return null;
}

/**
 * A chart as a Standard MIDI file (format 0, one track): melodies and plucked notes as notes on
 * channel 1, strummed chords as the four strings, and drum lanes on the percussion channel. Returns
 * the file's bytes.
 */
export function chartToMidi(chart: Chart): Uint8Array {
  const spb = 60 / chart.meta.bpm;
  const tick = (seconds: number) => Math.round((seconds / spb) * PPQ);
  const events: Event[] = [];
  const beatsPerBar = chart.meta.beatsPerBar ?? 4;
  // tempo (microseconds per quarter note) and time signature, then the title
  events.push({
    tick: 0,
    order: 0,
    bytes: [0xff, 0x51, 3, ...u32(Math.round(60_000_000 / chart.meta.bpm)).slice(1)],
  });
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x58, 4, beatsPerBar, 2, 24, 8] });
  const title = text(chart.meta.title).slice(0, 100);
  events.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(title.length), ...title] });
  for (const n of chart.notes) {
    const s = soundingNotes(
      n,
      chart.meta.instruments?.find((i) => guitarOpenFor(i) !== null),
    );
    if (!s) continue;
    const start = tick(n.t);
    // a hit with no length is a short note; a sustained note keeps its length
    const length = Math.max(n.duration > 0 ? tick(n.duration) : PPQ / 8, 1);
    const channel = s.drum ? 9 : 0;
    for (const p of s.pitches) {
      const key = Math.min(127, Math.max(0, Math.round(p)));
      events.push({ tick: start, order: 2, bytes: [0x90 | channel, key, 90] });
      events.push({ tick: start + length, order: 1, bytes: [0x80 | channel, key, 0] });
    }
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const body: number[] = [];
  let last = 0;
  for (const e of events) {
    body.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  body.push(0, 0xff, 0x2f, 0); // end of track
  return new Uint8Array([
    ...text('MThd'),
    ...u32(6),
    ...u16(0),
    ...u16(1),
    ...u16(PPQ),
    ...text('MTrk'),
    ...u32(body.length),
    ...body,
  ]);
}

// ---------------------------------------------------------------------------------------- reading

/** One note read from a MIDI file, in ticks. */
export interface MidiNote {
  tick: number;
  duration: number;
  pitch: number;
}

/** A track (or channel within one) of a MIDI file. */
export interface MidiTrack {
  /** The track's name, or a generic one. */
  name: string;
  channel: number;
  /** Percussion (channel 10): the pitches are drums, not notes. */
  drum: boolean;
  notes: MidiNote[];
}

/** What was read from a MIDI file. */
export interface MidiFile {
  /** Ticks to a quarter note. */
  ppq: number;
  /** Beats per minute of the first tempo marking (100 if none). */
  bpm: number;
  /** Beats to the bar from the first time signature (4 if none). */
  beatsPerBar: number;
  title: string;
  /** Tracks that have notes, one per channel used, longest first among melodic ones. */
  tracks: MidiTrack[];
}

const MAX_MIDI_BYTES = 2_000_000;

/** Reads a Standard MIDI file (format 0 or 1). Throws a message in plain words if it cannot. */
export function parseMidi(bytes: Uint8Array): MidiFile {
  if (bytes.length > MAX_MIDI_BYTES) throw new Error('That MIDI file is too big (over 2 MB).');
  let pos = 0;
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error('That MIDI file is cut short.');
  };
  const read8 = () => {
    need(1);
    return bytes[pos++]!;
  };
  const read16 = () => (read8() << 8) | read8();
  const read32 = () => ((read8() << 24) | (read8() << 16) | (read8() << 8) | read8()) >>> 0;
  const readVlq = () => {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = read8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('That MIDI file has a bad time value.');
  };
  const tag = () => {
    need(4);
    const s = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    pos += 4;
    return s;
  };
  // some files start with a RIFF wrapper; skip to the header
  if (bytes.length > 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') pos = 20;
  if (tag() !== 'MThd') throw new Error('That is not a MIDI file.');
  const headLen = read32();
  const format = read16();
  const trackCount = read16();
  const division = read16();
  pos += Math.max(0, headLen - 6);
  if (format > 1) throw new Error('Only simple MIDI files (format 0 or 1) are supported.');
  if (division & 0x8000) throw new Error('MIDI files timed in frames are not supported.');
  const ppq = division || PPQ;

  let bpm: number | null = null;
  let beatsPerBar: number | null = null;
  let title = '';
  const tracks: MidiTrack[] = [];
  for (let t = 0; t < trackCount && pos < bytes.length; t++) {
    const kind = tag();
    const length = read32();
    const end = Math.min(bytes.length, pos + length);
    if (kind !== 'MTrk') {
      pos = end;
      continue;
    }
    let tick = 0;
    let running = 0;
    let name = '';
    const open = new Map<string, number>();
    const byChannel = new Map<number, MidiNote[]>();
    while (pos < end) {
      tick += readVlq();
      let status = read8();
      if (status < 0x80) {
        pos--; // running status: this byte is data
        status = running;
        if (status === 0) throw new Error('That MIDI file is damaged.');
      }
      if (status === 0xff) {
        const type = read8();
        const len = readVlq();
        // a meta event stays inside its own track, so no byte is read (or decoded) twice
        if (pos + len > end) throw new Error('That MIDI file is damaged.');
        const data = bytes.subarray(pos, pos + len);
        pos += len;
        if (type === 0x51 && len === 3 && bpm === null) {
          bpm = 60_000_000 / ((data[0]! << 16) | (data[1]! << 8) | data[2]!);
        } else if (type === 0x58 && len >= 2 && beatsPerBar === null) {
          // numerator, and the denominator as a power of two: 6/8 is two dotted-quarter beats
          const den = 2 ** data[1]!;
          beatsPerBar = den === 8 && data[0]! % 3 === 0 ? data[0]! / 3 : data[0]!;
        } else if (type === 0x03 && name === '') name = untext(data);
        else if (type === 0x2f) break;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const len = readVlq();
        if (pos + len > end) throw new Error('That MIDI file is damaged.');
        pos += len;
        continue;
      }
      running = status;
      const channel = status & 0x0f;
      const hi = status & 0xf0;
      const size = hi === 0xc0 || hi === 0xd0 ? 1 : 2;
      const d1 = read8();
      const d2 = size === 2 ? read8() : 0;
      if (hi === 0x90 && d2 > 0) {
        open.set(`${channel}:${d1}`, tick);
      } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
        const key = `${channel}:${d1}`;
        const from = open.get(key);
        if (from !== undefined) {
          open.delete(key);
          const list = byChannel.get(channel) ?? [];
          list.push({ tick: from, duration: Math.max(1, tick - from), pitch: d1 });
          byChannel.set(channel, list);
        }
      }
    }
    pos = end;
    if (name !== '' && title === '') title = name;
    for (const [channel, notes] of byChannel) {
      notes.sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
      tracks.push({
        name: name || `Track ${tracks.length + 1}`,
        channel,
        drum: channel === 9,
        notes,
      });
    }
  }
  if (tracks.length === 0) throw new Error('There are no notes in that MIDI file.');
  tracks.sort((a, b) => Number(a.drum) - Number(b.drum) || b.notes.length - a.notes.length);
  return {
    ppq,
    bpm: bpm ?? 100,
    beatsPerBar: beatsPerBar ?? 4,
    title,
    tracks,
  };
}

// ----------------------------------------------------------------------------- into song text

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** A length of `steps` grid steps (`perBeat` to a beat) as notation text: "2", "1/2", "3/4". */
function beats(steps: number, perBeat: number): string {
  const g = gcd(steps, perBeat);
  const n = steps / g;
  const d = perBeat / g;
  return d === 1 ? String(n) : `${n}/${d}`;
}

/** The grid (steps to a beat) that the note starts sit on best: sixteenths, or triplets if they fit better. */
function bestGrid(ticks: readonly number[], ppq: number): number {
  const error = (perBeat: number) =>
    ticks.reduce((sum, t) => {
      const x = (t / ppq) * perBeat;
      return sum + Math.abs(x - Math.round(x));
    }, 0) / Math.max(1, ticks.length);
  const straight = error(4);
  if (straight < 0.06) return 4;
  return error(12) < straight * 0.6 ? 12 : 4;
}

/** A melody read from a MIDI track, as the notation of My songs. */
export interface MidiMelody {
  notes: string;
  /** The pitch class (0 = C) of the major key the notes fit best. */
  key: number;
  /** Notes kept / found, when the track had to be cut to fit. */
  kept: number;
  found: number;
}

/** Semitones of a major scale from its tonic. */
const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

/** The major key (pitch class of its tonic) whose scale holds the most of the notes. */
export function detectKey(pitches: readonly number[]): number {
  let best = 0;
  let bestScore = -1;
  for (let tonic = 0; tonic < 12; tonic++) {
    let score = 0;
    for (const p of pitches) if (MAJOR.has((((p - tonic) % 12) + 12) % 12)) score++;
    if (score > bestScore) {
      best = tonic;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A single line from a melodic track: when notes sound together the highest is kept, starts are
 * moved to a sixteenth (or triplet) grid, rests are written for gaps, and it is placed in the
 * octave range My songs accepts. At most `maxNotes` notes and `maxChars` characters are kept.
 */
export function midiToMelody(
  track: MidiTrack,
  ppq: number,
  { maxNotes = 400, maxChars = 3900 }: { maxNotes?: number; maxChars?: number } = {},
): MidiMelody {
  // the highest note at each start time
  const top = new Map<number, MidiNote>();
  for (const n of track.notes) {
    const have = top.get(n.tick);
    if (!have || n.pitch > have.pitch) top.set(n.tick, n);
  }
  const line = [...top.values()].sort((a, b) => a.tick - b.tick);
  if (line.length === 0) throw new Error('There are no notes in that track.');
  const perBeat = bestGrid(
    line.map((n) => n.tick),
    ppq,
  );
  const step = (ticks: number) => (ticks / ppq) * perBeat;
  // keep the whole line in the range My songs accepts, by octaves
  const lows = line.map((n) => n.pitch);
  let shift = 0;
  const mid = (Math.min(...lows) + Math.max(...lows)) / 2;
  while (mid + shift > 84) shift -= 12;
  while (mid + shift < 48) shift += 12;
  const out: string[] = [];
  const pitches: number[] = [];
  let cursor = 0; // in grid steps
  let chars = 0;
  for (let i = 0; i < line.length && out.length < maxNotes; i++) {
    const n = line[i]!;
    const startStep = Math.max(cursor, Math.round(step(n.tick)));
    const next = line[i + 1];
    // a note lasts as long as it sounds, but not into the next note
    const limit = next ? Math.round(step(next.tick)) : Infinity;
    const wanted = Math.max(1, Math.round(step(n.duration)));
    const length = Math.max(1, Math.min(wanted, limit - startStep));
    const pieces: string[] = [];
    if (startStep > cursor) pieces.push(`r:${beats(startStep - cursor, perBeat)}`);
    const pitch = Math.min(96, Math.max(36, n.pitch + shift));
    pieces.push(`${midiLabel(pitch)}:${beats(length, perBeat)}`);
    const add = pieces.join(' ');
    if (chars + add.length + 1 > maxChars) break;
    out.push(add);
    chars += add.length + 1;
    pitches.push(pitch);
    cursor = startStep + length;
  }
  if (pitches.length === 0) throw new Error('That track is too long to use.');
  return {
    notes: out.join(' '),
    key: detectKey(pitches),
    kept: pitches.length,
    found: line.length,
  };
}

/** A percussion track read as rhythm lanes of a drum kit: `kick: x...x...` lines. */
export interface MidiRhythm {
  lanes: string;
  stepsPerBeat: 2 | 3;
  /** Bars kept (a rhythm of My songs repeats nothing, so the first few bars are taken). */
  bars: number;
}

/**
 * The first bars of a percussion track as a kit rhythm: kick, snare and hat (other drums are
 * folded into these), one line per lane, with at most one sound on any step.
 */
export function midiToRhythm(
  track: MidiTrack,
  ppq: number,
  beatsPerBar: number,
  { maxBars = 8 }: { maxBars?: number } = {},
): MidiRhythm {
  const stepsPerBeat: 2 | 3 =
    bestGrid(
      track.notes.map((n) => n.tick),
      ppq,
    ) === 12
      ? 3
      : 2;
  const perBar = beatsPerBar * stepsPerBeat;
  const grid = new Map<number, string>(); // step -> lane (one sound per step, kick beats snare beats hat)
  const rank: Record<string, number> = { kick: 3, snare: 2, hat: 1 };
  for (const n of track.notes) {
    const lane = KIT_LANE_OF[n.pitch];
    if (!lane) continue;
    const s = Math.round((n.tick / ppq) * stepsPerBeat);
    if (s >= maxBars * perBar) continue;
    const have = grid.get(s);
    if (!have || rank[lane]! > rank[have]!) grid.set(s, lane);
  }
  if (grid.size === 0) throw new Error('No kick, snare or hi-hat notes in that track.');
  const last = Math.max(...grid.keys());
  const bars = Math.max(1, Math.ceil((last + 1) / perBar));
  const lines = ['kick', 'snare', 'hat'].flatMap((lane) => {
    const row = Array.from({ length: bars * perBar }, (_, s) => (grid.get(s) === lane ? 'x' : '.'));
    if (!row.includes('x')) return [];
    const bar = (b: number) => row.slice(b * perBar, (b + 1) * perBar).join('');
    return [`${lane}: ${Array.from({ length: bars }, (_, b) => bar(b)).join(' | ')}`];
  });
  return { lanes: lines.join('\n'), stepsPerBeat, bars };
}
