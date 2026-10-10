import type { ChartNote, Lane } from '@lineup/core';
import {
  COLORS,
  type Canvas2D,
  type HitFlash,
  type RenderSize,
  type RenderView,
  type Renderer,
} from './renderer';

export interface LaneLayout {
  nowX: number;
  pxPerSec: number;
  lookAhead: number;
  /** Plot area (the lane labels live in the gutter left of `left`). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  laneHeight: number;
  /** Note radius, px. */
  radius: number;
}

export interface LaneLayoutOptions {
  lookAhead?: number;
  nowFraction?: number;
  gutter?: number;
}

export function computeLaneLayout(
  size: RenderSize,
  laneCount: number,
  { lookAhead = 4, nowFraction = 0.2, gutter = 56 }: LaneLayoutOptions = {},
): LaneLayout {
  const left = gutter;
  const right = size.width;
  const nowX = left + (right - left) * nowFraction;
  const top = 6;
  const bottom = Math.max(top + 1, size.height - 6);
  const laneHeight = (bottom - top) / Math.max(1, laneCount);
  return {
    nowX,
    pxPerSec: (right - nowX) / lookAhead,
    lookAhead,
    left,
    right,
    top,
    bottom,
    laneHeight,
    radius: Math.max(6, Math.min(24, laneHeight * 0.34)),
  };
}

export const laneCenterY = (l: LaneLayout, laneIndex: number): number =>
  l.top + l.laneHeight * (laneIndex + 0.5);

export const hitTimeToX = (l: LaneLayout, t: number, now: number): number =>
  l.nowX + (t - now) * l.pxPerSec;

/** Flash lane meaning "no particular lane": the whole now line lights up. */
export const ANY_LANE = '*';

/** How long a hit flash lasts, seconds. */
export const FLASH_SECONDS = 0.28;

/** Flash progress 0 (just hit) .. 1 (gone); null when it is over or in the future. */
export function flashProgress(flash: HitFlash, now: number): number | null {
  const age = now - flash.time;
  if (age < 0 || age > FLASH_SECONDS) return null;
  return age / FLASH_SECONDS;
}

const statusRing = (status: string): string | null =>
  status === 'perfect'
    ? COLORS.perfect
    : status === 'good'
      ? COLORS.good
      : status === 'miss'
        ? COLORS.miss
        : null;

/**
 * Percussion lanes: one horizontal lane per sound, time scrolling toward a
 * "now" line on the left. Notes are discs in the lane's colour; once judged
 * they are dimmed and ringed green / yellow / red. Each detected hit flashes
 * an expanding ring on the now line in the lane it was classified into
 * (grey, across every lane, for a sound the classifier rejected).
 */
export class PercussionLanesRenderer implements Renderer {
  readonly kind = 'percussion-lanes' as const;

  constructor(private readonly options: LaneLayoutOptions = {}) {}

  draw(g: Canvas2D, size: RenderSize, view: RenderView): void {
    const lanes = view.profile.lanes ?? [];
    const l = computeLaneLayout(size, lanes.length, this.options);
    const laneIndex = new Map(lanes.map((lane, i) => [lane.id, i] as const));

    g.save();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, size.width, size.height);
    this.drawLanes(g, l, lanes, size);

    g.save();
    g.beginPath();
    g.rect(l.left, 0, l.right - l.left, size.height);
    g.clip();
    this.drawNotes(g, l, view, laneIndex);
    g.restore();

    this.drawNowLine(g, l, size);
    this.drawFlashes(g, l, view, lanes, laneIndex, size);
    g.restore();
  }

  private drawLanes(g: Canvas2D, l: LaneLayout, lanes: readonly Lane[], size: RenderSize): void {
    g.font = `600 ${Math.max(10, Math.min(15, l.laneHeight * 0.3))}px system-ui, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    lanes.forEach((lane, i) => {
      const y0 = l.top + i * l.laneHeight;
      g.fillStyle = i % 2 === 0 ? COLORS.panel : COLORS.bg;
      g.fillRect(l.left, y0, size.width - l.left, l.laneHeight);
      g.strokeStyle = COLORS.grid;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(l.left, laneCenterY(l, i));
      g.lineTo(size.width, laneCenterY(l, i));
      g.stroke();
      g.fillStyle = lane.color;
      g.fillText(lane.label, l.left - 8, laneCenterY(l, i));
    });
  }

  private drawNotes(
    g: Canvas2D,
    l: LaneLayout,
    view: RenderView,
    laneIndex: ReadonlyMap<string, number>,
  ): void {
    const lanes = view.profile.lanes ?? [];
    view.notes.forEach((n: ChartNote, i) => {
      const li = n.lane === undefined ? 0 : laneIndex.get(n.lane);
      if (li === undefined) return;
      const x = hitTimeToX(l, n.t, view.time);
      if (x < l.left - l.radius || x > l.right + l.radius) return;
      const status = view.statuses[i] ?? 'pending';
      const y = laneCenterY(l, li);
      const color = lanes[li]?.color ?? COLORS.pending;
      g.globalAlpha = status === 'pending' ? 1 : status === 'miss' ? 0.4 : 0.55;
      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, l.radius, 0, Math.PI * 2);
      g.fill();
      const ring = statusRing(status);
      if (ring) {
        g.globalAlpha = 1;
        g.strokeStyle = ring;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, l.radius + 2, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
      const chord = n.expected?.chord;
      if (chord) {
        // strum charts: which chord to play, written on the note
        g.fillStyle = COLORS.bg;
        g.font = `700 ${Math.max(9, Math.round(l.radius * 0.75))}px system-ui, sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.globalAlpha = status === 'pending' ? 1 : 0.8;
        g.fillText(chord, x, y);
        g.globalAlpha = 1;
      }
    });
  }

  private drawNowLine(g: Canvas2D, l: LaneLayout, size: RenderSize): void {
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(l.nowX, 0);
    g.lineTo(l.nowX, size.height);
    g.stroke();
    g.globalAlpha = 1;
  }

  private drawFlashes(
    g: Canvas2D,
    l: LaneLayout,
    view: RenderView,
    lanes: readonly Lane[],
    laneIndex: ReadonlyMap<string, number>,
    size: RenderSize,
  ): void {
    for (const flash of view.hits ?? []) {
      const p = flashProgress(flash, view.time);
      if (p === null) continue;
      const strength = 0.4 + 0.6 * Math.min(1, Math.max(0, flash.velocity));
      const alpha = (1 - p) * strength;
      if (flash.lane === ANY_LANE) {
        // a hit with no lane of its own (a strum: direction is not detected): flash the whole now line
        g.globalAlpha = alpha;
        g.fillStyle = COLORS.active;
        g.shadowColor = COLORS.active;
        g.shadowBlur = 16;
        g.fillRect(l.nowX - 5, 0, 10, size.height);
        g.shadowBlur = 0;
        g.globalAlpha = 1;
        continue;
      }
      const li = laneIndex.get(flash.lane);
      if (li === undefined) {
        // unrecognised sound: a grey bar over the whole now line
        g.globalAlpha = alpha * 0.8;
        g.fillStyle = COLORS.muted;
        g.fillRect(l.nowX - 4, 0, 8, size.height);
        g.globalAlpha = 1;
        continue;
      }
      const y = laneCenterY(l, li);
      const color = lanes[li]?.color ?? COLORS.text;
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.shadowColor = color;
      g.shadowBlur = 16;
      g.beginPath();
      g.arc(l.nowX, y, l.radius * (1 + 0.6 * p), 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
  }
}
