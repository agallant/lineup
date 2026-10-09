import { noteFromFrequency, type ChartNote } from '@lineup/core';
import {
  COLORS,
  roundedRect,
  type Canvas2D,
  type RenderSize,
  type RenderView,
  type Renderer,
} from './renderer';
import { PercussionLanesRenderer } from './percussion-lanes';

export interface HighwayLayout {
  /** x of the "now" line. */
  nowX: number;
  /** Pixels per second of song time. */
  pxPerSec: number;
  /** Seconds of the future visible to the right of the now line. */
  lookAhead: number;
  /** Seconds of the past visible to the left. */
  lookBehind: number;
  /** Lowest and highest MIDI pitch visible (fractional edges allowed). */
  lowMidi: number;
  highMidi: number;
  /** Plot area. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface LayoutOptions {
  lookAhead?: number;
  /** Fraction of the plot width at which the now line sits. */
  nowFraction?: number;
  /** Visible pitch span is at least this many semitones. */
  minSpan?: number;
  /** Semitones of margin above/below the chart's range. */
  margin?: number;
  /** Pixels reserved at the left for note names. */
  gutter?: number;
}

/** The semitone range to show: chart range plus margin, at least `minSpan` tall, centred. */
export function pitchRangeFor(
  notes: readonly ChartNote[],
  minSpan = 14,
  margin = 2,
): { low: number; high: number } {
  let low = Infinity;
  let high = -Infinity;
  for (const n of notes) {
    if (n.pitch === undefined) continue;
    low = Math.min(low, n.pitch);
    high = Math.max(high, n.pitch);
  }
  if (!(low <= high)) return { low: 55, high: 55 + minSpan };
  low -= margin;
  high += margin;
  const span = high - low;
  if (span < minSpan) {
    const extra = (minSpan - span) / 2;
    low -= extra;
    high += extra;
  }
  return { low, high };
}

export function computeLayout(
  size: RenderSize,
  notes: readonly ChartNote[],
  { lookAhead = 5, nowFraction = 0.28, minSpan = 14, margin = 2, gutter = 34 }: LayoutOptions = {},
): HighwayLayout {
  const { low, high } = pitchRangeFor(notes, minSpan, margin);
  const left = gutter;
  const right = size.width;
  const plotWidth = Math.max(1, right - left);
  const nowX = left + plotWidth * nowFraction;
  const pxPerSec = (right - nowX) / lookAhead;
  return {
    nowX,
    pxPerSec,
    lookAhead,
    lookBehind: (nowX - left) / pxPerSec,
    lowMidi: low,
    highMidi: high,
    top: 6,
    bottom: Math.max(7, size.height - 6),
    left,
    right,
  };
}

export const timeToX = (l: HighwayLayout, t: number, now: number): number =>
  l.nowX + (t - now) * l.pxPerSec;

/** Higher pitch = higher on screen (smaller y). */
export const midiToY = (l: HighwayLayout, midi: number): number =>
  l.bottom - ((midi - l.lowMidi) / (l.highMidi - l.lowMidi)) * (l.bottom - l.top);

export const pxPerSemitone = (l: HighwayLayout): number =>
  (l.bottom - l.top) / (l.highMidi - l.lowMidi);

const NATURAL = new Set([0, 2, 4, 5, 7, 9, 11]);
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const midiName = (midi: number): string =>
  `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

function noteColor(status: RenderView['statuses'][number], active: boolean): string {
  switch (status) {
    case 'perfect':
      return COLORS.perfect;
    case 'good':
      return COLORS.good;
    case 'miss':
      return COLORS.miss;
    default:
      return active ? COLORS.active : COLORS.pending;
  }
}

/**
 * SingStar-style pitch highway: time scrolls right to left, pitch is vertical,
 * each note is a bar whose height is the pitch tolerance, and the player's own
 * pitch is drawn as a live trail that turns green when it is on target.
 */
export class PitchHighwayRenderer implements Renderer {
  readonly kind = 'pitch-highway' as const;
  private cachedNotes: readonly ChartNote[] | null = null;
  private cachedSize = '';
  private layout: HighwayLayout | null = null;

  constructor(private readonly options: LayoutOptions = {}) {}

  /** The layout used for the last draw (for tests and overlays). */
  currentLayout(size: RenderSize, notes: readonly ChartNote[]): HighwayLayout {
    const key = `${size.width}x${size.height}`;
    if (!this.layout || this.cachedNotes !== notes || this.cachedSize !== key) {
      this.layout = computeLayout(size, notes, this.options);
      this.cachedNotes = notes;
      this.cachedSize = key;
    }
    return this.layout;
  }

  draw(g: Canvas2D, size: RenderSize, view: RenderView): void {
    const l = this.currentLayout(size, view.notes);
    const tol = (view.profile.judgment.pitch?.toleranceCents ?? 50) / 100; // semitones
    const spp = pxPerSemitone(l);

    g.save();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, size.width, size.height);

    this.drawGrid(g, l, size);

    // clip the scrolling content to the plot area
    g.save();
    g.beginPath();
    g.rect(l.left, 0, l.right - l.left, size.height);
    g.clip();
    const bars = this.drawNotes(g, l, view, tol, spp);
    this.drawTrail(g, l, view);
    this.drawLabels(g, bars);
    g.restore();

    this.drawNowLine(g, l, size);
    g.restore();
  }

  private drawGrid(g: Canvas2D, l: HighwayLayout, size: RenderSize): void {
    const first = Math.ceil(l.lowMidi);
    const last = Math.floor(l.highMidi);
    const spp = pxPerSemitone(l);
    g.font = `${Math.max(9, Math.min(13, spp * 0.7))}px system-ui, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let m = first; m <= last; m++) {
      const y = midiToY(l, m);
      const natural = NATURAL.has(((m % 12) + 12) % 12);
      g.fillStyle = natural ? COLORS.panel : COLORS.bg;
      g.fillRect(l.left, y - spp / 2, size.width - l.left, spp);
      g.strokeStyle = m % 12 === 0 ? COLORS.gridStrong : COLORS.grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(l.left, y);
      g.lineTo(size.width, y);
      g.stroke();
      if (natural && spp >= 8) {
        g.fillStyle = m % 12 === 0 ? COLORS.text : COLORS.muted;
        g.fillText(midiName(m), l.left - 4, y);
      }
    }
  }

  /** Draws the note bars and returns where they are, so labels can go on top of the trail. */
  private drawNotes(
    g: Canvas2D,
    l: HighwayLayout,
    view: RenderView,
    tol: number,
    spp: number,
  ): { x: number; y: number; w: number; h: number; text: string }[] {
    const barH = Math.max(12, spp * Math.max(1, tol * 2) * 0.9);
    const bars: { x: number; y: number; w: number; h: number; text: string }[] = [];
    view.notes.forEach((n, i) => {
      if (n.pitch === undefined) return;
      const d = Math.max(n.duration, 0.2);
      const x0 = timeToX(l, n.t, view.time);
      const x1 = timeToX(l, n.t + d, view.time);
      if (x1 < l.left || x0 > l.right) return; // off screen
      const status = view.statuses[i] ?? 'pending';
      const active = view.time >= n.t && view.time < n.t + d;
      const cy = midiToY(l, n.pitch);
      const w = Math.max(6, x1 - x0 - 2);

      // judged notes are dimmed so the player's trail reads clearly on top of them
      g.globalAlpha = status === 'miss' ? 0.5 : status === 'pending' ? 1 : 0.62;
      g.fillStyle = noteColor(status, active);
      if (active && view.live?.noteIndex === i && view.live.onPitch) {
        g.shadowColor = COLORS.trailOn;
        g.shadowBlur = 14;
        g.fillStyle = COLORS.trailOn;
        g.globalAlpha = 1;
      }
      roundedRect(g, x0, cy - barH / 2, w, barH, barH / 2);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
      bars.push({ x: x0, y: cy, w, h: barH, text: midiName(n.pitch) });
    });
    return bars;
  }

  private drawLabels(
    g: Canvas2D,
    bars: readonly { x: number; y: number; w: number; h: number; text: string }[],
  ): void {
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillStyle = COLORS.bg;
    for (const b of bars) {
      if (b.w <= 34 || b.h < 14) continue;
      g.font = `600 ${Math.min(14, Math.round(b.h * 0.62))}px system-ui, sans-serif`;
      g.fillText(b.text, b.x + 8, b.y);
    }
  }

  private drawTrail(g: Canvas2D, l: HighwayLayout, view: RenderView): void {
    const trail = view.trail;
    if (!trail || trail.length === 0) return;
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let prev: (typeof trail)[number] | null = null;
    for (const p of trail) {
      if (p.midi === null) {
        prev = null;
        continue;
      }
      if (prev && prev.midi !== null && p.time - prev.time < 0.08) {
        const x0 = timeToX(l, prev.time, view.time);
        const y0 = midiToY(l, prev.midi);
        const x1 = timeToX(l, p.time, view.time);
        const y1 = midiToY(l, p.midi);
        // dark outline first, so the line stays visible over same-coloured bars
        g.strokeStyle = COLORS.trailOutline;
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.strokeStyle = p.onPitch ? COLORS.trailOn : COLORS.trailOff;
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      prev = p;
    }
    const last = trail[trail.length - 1]!;
    if (last.midi !== null && view.time - last.time < 0.15) {
      g.fillStyle = last.onPitch ? COLORS.trailOn : COLORS.trailOff;
      g.shadowColor = g.fillStyle as string;
      g.shadowBlur = 12;
      g.beginPath();
      g.arc(timeToX(l, last.time, view.time), midiToY(l, last.midi), 7, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = COLORS.text;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  private drawNowLine(g: Canvas2D, l: HighwayLayout, size: RenderSize): void {
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(l.nowX, 0);
    g.lineTo(l.nowX, size.height);
    g.stroke();
    g.globalAlpha = 1;
  }
}

/** The pitch the tracker reports, as a note name and cents, for overlays. */
export function describePitch(hz: number | null): { name: string; cents: number } | null {
  if (hz === null || !(hz > 0)) return null;
  const n = noteFromFrequency(hz);
  return { name: n.label, cents: n.cents };
}

/** Creates the renderer a profile asks for. */
export function createRenderer(kind: Renderer['kind']): Renderer {
  if (kind === 'pitch-highway') return new PitchHighwayRenderer();
  if (kind === 'percussion-lanes') return new PercussionLanesRenderer();
  throw new Error(`renderer "${kind}" is not implemented yet`);
}
