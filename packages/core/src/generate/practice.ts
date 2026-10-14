import { loadChart, type Chart } from '../chart';

/** A stretch of a song to practise on its own: a phrase between two bar lines. */
export interface Part {
  /** "Bars 1–4". */
  label: string;
  /** Start and end in seconds of song time. */
  from: number;
  to: number;
}

/** Bars in a phrase: four, or two in a short song so there are still a few phrases to practise. */
export function phraseBars(chart: Chart): number {
  const barLen = (60 / chart.meta.bpm) * (chart.meta.beatsPerBar ?? 4);
  return chart.notes.at(-1)!.t / barLen >= 12 ? 4 : 2;
}

/** A phrase needs at least this many notes to be worth practising on its own. */
const MIN_PART_NOTES = 3;

/**
 * The phrases of a song, or none if it is too short to split into at least two. Phrases with fewer
 * than a few notes (silent stretches, or one last note on a bar line) are left out.
 */
export function songParts(chart: Chart): Part[] {
  const barLen = (60 / chart.meta.bpm) * (chart.meta.beatsPerBar ?? 4);
  const bars = phraseBars(chart);
  const phraseLen = barLen * bars;
  const count = Math.floor((chart.notes.at(-1)!.t + 1e-6) / phraseLen) + 1;
  if (count < 2) return [];
  const parts = Array.from({ length: count }, (_, i) => ({
    label: `Bars ${i * bars + 1}–${(i + 1) * bars}`,
    from: i * phraseLen,
    to: (i + 1) * phraseLen,
  })).filter(
    (p) =>
      chart.notes.filter((n) => n.t >= p.from - 1e-6 && n.t < p.to - 1e-6).length >= MIN_PART_NOTES,
  );
  return parts.length >= 2 ? parts : [];
}

/**
 * Just one part of a song, moved to start at song time 0 (the count-in still comes first). A part
 * with no notes in it leaves the song as it is.
 */
export function slicePart(chart: Chart, part: Part): Chart {
  const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
  const notes = chart.notes
    .filter((n) => n.t >= part.from - 1e-6 && n.t < part.to - 1e-6)
    .map((n) => ({ ...n, t: round6(Math.max(0, n.t - part.from)) }));
  if (notes.length === 0) return chart;
  const result = loadChart({ ...chart, notes });
  if (!result.ok) throw new Error(`a part of a song is invalid:\n${result.errors.join('\n')}`);
  return result.value;
}

/** The chart for part `index` of its phrases, or the whole chart for -1 or an index that does not exist. */
export function applyPart(chart: Chart, index: number): Chart {
  const part = index >= 0 ? songParts(chart)[index] : undefined;
  return part ? slicePart(chart, part) : chart;
}

/**
 * A song for "listen first, then play it back": the same notes moved later by the length of the song
 * plus a short gap (a whole number of beats, so the clicks line up), leaving room to hear it
 * played first. `listenEnd` is where the player's turn begins, in song time.
 */
export function echoChart(chart: Chart, gapBeats = 2): { chart: Chart; listenEnd: number } {
  const spb = 60 / chart.meta.bpm;
  const end = chart.notes.reduce((m, n) => Math.max(m, n.t + n.duration), 0);
  const listenEnd = Math.round(Math.ceil((end + gapBeats * spb) / spb - 1e-6) * spb * 1e6) / 1e6;
  const notes = chart.notes.map((n) => ({ ...n, t: Math.round((n.t + listenEnd) * 1e6) / 1e6 }));
  const result = loadChart({ ...chart, notes });
  if (!result.ok) throw new Error(`an echo chart is invalid:\n${result.errors.join('\n')}`);
  return { chart: result.value, listenEnd };
}

/** The length of a phrase in seconds of song time. */
export function phraseSeconds(chart: Chart): number {
  return (60 / chart.meta.bpm) * (chart.meta.beatsPerBar ?? 4) * phraseBars(chart);
}

/**
 * For a duet: which of two players (0 or 1) sings each note. Phrases alternate, the first phrase
 * going to player 0. Null for a song too short to have two phrases to share.
 */
export function duetPlayers(chart: Chart): number[] | null {
  if (songParts(chart).length < 2) return null;
  const len = phraseSeconds(chart);
  return chart.notes.map((n) => Math.floor((n.t + 1e-6) / len) % 2);
}

/** How one duet player did: notes hit (perfect or good), notes that were perfect, and all their notes. */
export interface DuetTally {
  hit: number;
  perfect: number;
  total: number;
}

/** Each player's tally from the status of every note (anything not yet judged counts as a miss). */
export function duetTally(
  players: readonly number[],
  statuses: readonly string[],
): [DuetTally, DuetTally] {
  const out: [DuetTally, DuetTally] = [
    { hit: 0, perfect: 0, total: 0 },
    { hit: 0, perfect: 0, total: 0 },
  ];
  players.forEach((p, i) => {
    const t = out[p === 1 ? 1 : 0];
    t.total++;
    const status = statuses[i];
    if (status === 'perfect') {
      t.hit++;
      t.perfect++;
    } else if (status === 'good') t.hit++;
  });
  return out;
}

/** The player who did better (more of their notes hit, then more perfect), or null for a tie. */
export function duetWinner(a: DuetTally, b: DuetTally): 0 | 1 | null {
  const rate = (t: DuetTally, of: 'hit' | 'perfect') => (t.total ? t[of] / t.total : 0);
  for (const of of ['hit', 'perfect'] as const) {
    const d = rate(a, of) - rate(b, of);
    if (Math.abs(d) > 1e-9) return d > 0 ? 0 : 1;
  }
  return null;
}
