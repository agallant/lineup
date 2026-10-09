import type { ChartNote, InstrumentProfile, NoteStatus, RendererKind } from '@lineup/core';

/**
 * The slice of CanvasRenderingContext2D the renderers use. Narrowing it lets
 * tests pass a recording stub, and keeps renderers honest about what they need.
 */
export type Canvas2D = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'arc'
  | 'closePath'
  | 'stroke'
  | 'fill'
  | 'fillRect'
  | 'fillText'
  | 'clip'
  | 'rect'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'globalAlpha'
  | 'shadowBlur'
  | 'shadowColor'
>;

export interface RenderSize {
  /** CSS pixels. */
  width: number;
  height: number;
}

/** One point of the player's pitch trail (pitched modes). */
export interface TrailPoint {
  /** Song time, latency-corrected. */
  time: number;
  /** Fractional MIDI pitch to plot (already octave-folded for display), or null for a gap. */
  midi: number | null;
  /** Within tolerance of the active target. */
  onPitch: boolean;
}

/** A hit to flash (percussion modes). */
export interface HitFlash {
  time: number;
  lane: string;
  velocity: number;
}

/** Everything a renderer reads: chart + judge state + clock. */
export interface RenderView {
  /** Song time now, from the clock. */
  time: number;
  notes: readonly ChartNote[];
  /** Per note: 'pending' until judged. */
  statuses: readonly NoteStatus[];
  profile: InstrumentProfile;
  /** Pitched modes: the player's recent pitch. */
  trail?: readonly TrailPoint[];
  /** Pitched modes: live feedback for the note being played now. */
  live?: { noteIndex: number | null; onPitch: boolean; coverage: number };
  /** Percussion modes: recent hits. */
  hits?: readonly HitFlash[];
}

export interface Renderer {
  readonly kind: RendererKind;
  draw(g: Canvas2D, size: RenderSize, view: RenderView): void;
}

/** Shared palette (matches the page's CSS custom properties). */
export const COLORS = {
  bg: '#14121f',
  panel: '#1f1c30',
  grid: '#2a2640',
  gridStrong: '#3b3656',
  text: '#ece9f7',
  muted: '#9b96b5',
  pending: '#5b7bd5',
  active: '#8fb0ff',
  perfect: '#06d6a0',
  good: '#ffd166',
  miss: '#ef476f',
  trailOn: '#06d6a0',
  trailOff: '#ff9f43',
  trailOutline: 'rgba(20, 18, 31, 0.85)',
} as const;

/** Rounded-rectangle path using only arcTo (widely supported, unlike roundRect). */
export function roundedRect(
  g: Pick<Canvas2D, 'beginPath' | 'moveTo' | 'arcTo' | 'closePath'>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}
