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

/** The phrases of a song, or none if it is too short to split into at least two. */
export function songParts(chart: Chart): Part[] {
  const barLen = (60 / chart.meta.bpm) * (chart.meta.beatsPerBar ?? 4);
  const bars = phraseBars(chart);
  const phraseLen = barLen * bars;
  const count = Math.floor((chart.notes.at(-1)!.t + 1e-6) / phraseLen) + 1;
  if (count < 2) return [];
  return Array.from({ length: count }, (_, i) => ({
    label: `Bars ${i * bars + 1}–${(i + 1) * bars}`,
    from: i * phraseLen,
    to: (i + 1) * phraseLen,
  }));
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
