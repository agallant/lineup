import { createRng, hashSeed, pick, type Chart, type Rng } from '@lineup/core';
import type { BackingEvent } from './backing';
import type { DrumVoice } from './drum-sound';

/**
 * A drum feel played quietly under a song. `auto` picks one to suit the song (its meter and tempo) and
 * varies it as the song goes: a different kick pattern every other bar and a fill at the end of each
 * phrase. The same song always gets the same drums.
 */
export type DrumStyle =
  | 'off'
  | 'auto'
  | 'rock'
  | 'pop'
  | 'ballad'
  | 'folk'
  | 'shuffle'
  | 'disco'
  | 'funk'
  | 'march'
  | 'reggae'
  | 'bossa';

export const DRUM_STYLES: readonly DrumStyle[] = [
  'off',
  'auto',
  'rock',
  'pop',
  'ballad',
  'folk',
  'shuffle',
  'disco',
  'funk',
  'march',
  'reggae',
  'bossa',
];

/** How each style is described in a menu. */
export const DRUM_LABELS: Readonly<Record<DrumStyle, string>> = {
  off: 'Off',
  auto: 'Match the song',
  rock: 'Rock',
  pop: 'Pop',
  ballad: 'Ballad (soft)',
  folk: 'Folk (boom-chick)',
  shuffle: 'Shuffle (swung)',
  disco: 'Disco (four on the floor)',
  funk: 'Funk (sixteenths)',
  march: 'March',
  reggae: 'Reggae (one drop)',
  bossa: 'Bossa nova',
};

/** Pitches (MIDI) naming each drum; they are the fallback when a context cannot synthesize the drums. */
const KICK = 36;
const TOM_LOW = 48;
const TOM_HIGH = 55;
const SNARE = 62;
const RIM = 74;
const HAT = 96;
const OPEN_HAT = 91;

const VOICES: ReadonlyMap<number, DrumVoice> = new Map([
  [KICK, 'kick'],
  [TOM_LOW, 'tomlow'],
  [TOM_HIGH, 'tomhigh'],
  [SNARE, 'snare'],
  [RIM, 'rim'],
  [HAT, 'hat'],
  [OPEN_HAT, 'openhat'],
]);

const drum = (songTime: number, midi: number, duration: number, level: number): BackingEvent => {
  const voice = VOICES.get(midi);
  return {
    kind: 'tone',
    songTime,
    duration,
    midi,
    level,
    wave:
      midi === HAT || midi === OPEN_HAT || midi === SNARE || midi === RIM ? 'square' : 'triangle',
    ...(voice ? { drum: voice } : {}),
  };
};

/** One hit of a bar: beats from the bar line, which drum, how loud. */
type Hit = readonly [at: number, drum: number, level: number];

const K = (at: number, level = 1.6): Hit => [at, KICK, level];
const S = (at: number, level = 0.9): Hit => [at, SNARE, level];
const R = (at: number, level = 0.5): Hit => [at, RIM, level];
const H = (at: number, level = 0.4): Hit => [at, HAT, level];
const O = (at: number, level = 0.55): Hit => [at, OPEN_HAT, level];

/** The eighth notes (0 to 15, over two bars of four) where bossa nova's syncopated tick falls. */
const BOSSA_TICKS: ReadonlySet<number> = new Set([0, 3, 6, 10, 12]);

const eighths = (n: number, level = 0.4): Hit[] =>
  Array.from({ length: n }, (_, i) => H(i * 0.5, i % 2 === 0 ? level + 0.1 : level));
const sixteenths = (n: number): Hit[] =>
  Array.from({ length: n }, (_, i) => H(i * 0.25, i % 4 === 0 ? 0.55 : i % 2 === 0 ? 0.4 : 0.25));

/** The hits of one bar of four beats in a style; `odd` is the second bar of each pair (a variation). */
function bar4(style: DrumStyle, odd: boolean): Hit[] {
  switch (style) {
    case 'rock':
      return [K(0), K(2), S(1), S(3), ...eighths(8, 0.35)];
    case 'pop':
      return [K(0), K(2), ...(odd ? [K(3.5)] : [K(2.5)]), S(1), S(3), ...eighths(8, 0.3)];
    case 'ballad':
      return [
        K(0, 1.3),
        ...(odd ? [K(2.5, 1.1)] : []),
        R(1),
        R(3),
        H(0, 0.3),
        H(1, 0.25),
        H(2, 0.3),
        H(3, 0.25),
      ];
    case 'folk':
      return [K(0, 1.3), K(2, 1.2), S(1, 0.55), S(3, 0.55), ...(odd ? [S(3.5, 0.3)] : [])];
    case 'shuffle': {
      // swung eighths: the second note of each pair a third of a beat late
      const hats: Hit[] = [];
      for (let b = 0; b < 4; b++) hats.push(H(b, 0.4), H(b + 2 / 3, 0.3));
      return [K(0), K(2), ...(odd ? [K(3 + 2 / 3, 1.2)] : []), S(1), S(3), ...hats];
    }
    case 'disco':
      return [
        K(0),
        K(1),
        K(2),
        K(3),
        S(1),
        S(3),
        O(0.5),
        O(1.5),
        O(2.5),
        O(3.5),
        ...(odd ? [H(0.75, 0.3), H(2.75, 0.3)] : []),
      ];
    case 'funk':
      return [
        K(0),
        K(0.75, 1.2),
        K(2.5),
        ...(odd ? [K(3.25, 1.1)] : []),
        S(1),
        S(3),
        S(1.75, 0.3),
        S(3.5, 0.3),
        ...sixteenths(16),
      ];
    case 'march':
      return [K(0), K(2), S(1), S(1.75, 0.6), S(3), S(3.75, 0.6), ...(odd ? [S(2.75, 0.4)] : [])];
    case 'reggae':
      // the one drop: nothing on one, the kick and rim together on three, the hat on the offbeats
      return [
        K(2),
        R(2, 0.7),
        ...[0.5, 1.5, 2.5, 3.5].map((a) => H(a, 0.45)),
        ...(odd ? [R(3.5, 0.3)] : []),
      ];
    default:
      return [];
  }
}

/** A bar of three beats (a waltz): the kick on one, ticks on two and three, in every style. */
function bar3(style: DrumStyle, odd: boolean): Hit[] {
  if (style === 'ballad' || style === 'folk') {
    return [K(0, 1.3), R(1, 0.4), R(2, 0.4), ...(odd ? [H(2.5, 0.25)] : [])];
  }
  return [K(0, 1.6), H(1, 0.5), H(2, 0.5), ...(odd ? [H(1.5, 0.25), H(2.5, 0.25)] : [])];
}

/** The fill that closes a phrase: the last beat of the bar, in a few ways chosen by the song's seed. */
function fill(kind: number, perBar: number, style: DrumStyle): Hit[] {
  const at = perBar - 1;
  if (style === 'shuffle') {
    return [S(at, 0.7), S(at + 1 / 3, 0.8), S(at + 2 / 3, 0.9)];
  }
  switch (kind % 3) {
    case 0:
      // a snare roll rising to the bar line
      return [S(at, 0.5), S(at + 0.25, 0.6), S(at + 0.5, 0.75), S(at + 0.75, 0.95)];
    case 1:
      // toms falling
      return [
        [at, TOM_HIGH, 1.2],
        [at + 0.25, TOM_HIGH, 1.2],
        [at + 0.5, TOM_LOW, 1.4],
        [at + 0.75, TOM_LOW, 1.4],
      ];
    default:
      // a kick and snare answer
      return [K(at, 1.2), S(at + 0.5, 0.8), S(at + 0.75, 0.9)];
  }
}

/** Styles that get a fill (the soft ones just stop short instead). */
const FILLS: ReadonlySet<DrumStyle> = new Set(['rock', 'pop', 'shuffle', 'disco', 'funk', 'march']);

/** The style `auto` chooses for a song: by meter and tempo, with the song's seed choosing among the fits. */
export function autoDrumStyle(chart: Chart, rng: Rng): DrumStyle {
  const bpm = chart.meta.bpm;
  if ((chart.meta.beatsPerBar ?? 4) === 3) return pick(rng, ['folk', 'ballad', 'pop'] as const);
  if (bpm < 72) return 'ballad';
  if (bpm < 92) return pick(rng, ['folk', 'pop', 'ballad', 'reggae'] as const);
  if (bpm < 112) return pick(rng, ['pop', 'rock', 'shuffle', 'bossa'] as const);
  if (bpm < 132) return pick(rng, ['rock', 'disco', 'funk', 'march'] as const);
  return pick(rng, ['march', 'disco', 'funk'] as const);
}

/**
 * A drum loop for the whole song, in song time. Rock: kick on 1 and 3, snare on 2 and 4, hat on the
 * eighths. Bossa: a steady kick on every beat with a syncopated rim. A bar of three (a waltz) gets
 * a kick on one and a hat on two and three. Every style but rock and bossa also changes its kick
 * every other bar, and the busier ones fill at the end of every fourth bar. `seed` (the song's title
 * by default) decides what `auto` picks and which fills are played.
 */
export function planDrums(
  chart: Chart,
  style: DrumStyle,
  seed: number = hashSeed(chart.meta.title),
): BackingEvent[] {
  if (style === 'off') return [];
  const rng = createRng(seed);
  const feel = style === 'auto' ? autoDrumStyle(chart, rng) : style;
  const fillKind = Math.floor(rng() * 3);
  const spb = 60 / chart.meta.bpm;
  const perBar = chart.meta.beatsPerBar ?? 4;
  const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration, n.t + 1e-6), 0);
  const events: BackingEvent[] = [];
  const beats = Math.ceil(end / spb);
  const bars = Math.ceil(beats / perBar);
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * perBar * spb;
    const odd = bar % 2 === 1;
    let hits: Hit[];
    if (feel === 'bossa' && perBar !== 3) {
      // a steady kick with a syncopated rim, counted over two bars
      hits = [];
      for (let b = 0; b < perBar; b++) {
        hits.push(K(b));
        const e = ((bar * perBar + b) % (perBar * 2)) * 2;
        if (BOSSA_TICKS.has(e)) hits.push(H(b, 0.6));
        if (BOSSA_TICKS.has(e + 1)) hits.push(H(b + 0.5, 0.6));
      }
    } else if (perBar === 3) {
      hits = bar3(feel, feel !== 'rock' && feel !== 'bossa' && odd);
    } else if (perBar === 4) {
      // rock keeps its plain bar; the other feels vary every other bar
      hits = bar4(feel, feel !== 'rock' && odd);
    } else {
      // an odd meter: the kick on one and the hat on the rest
      hits = [K(0), ...Array.from({ length: perBar - 1 }, (_, i) => H(i + 1, 0.5))];
    }
    // the fill closes each fourth bar, but not the last bar of the song
    const closes = bar % 4 === 3 && bar < bars - 1 && FILLS.has(feel);
    if (closes) {
      hits = [...hits.filter(([at]) => at < perBar - 1), ...fill(fillKind, perBar, feel)];
    }
    for (const [at, midi, level] of hits) {
      const t = t0 + at * spb;
      if (t > end + spb) continue;
      events.push(drum(t, midi, midi === KICK ? 0.12 : midi === SNARE ? 0.06 : 0.04, level));
    }
  }
  return events.sort((a, b) => a.songTime - b.songTime);
}
