import { noteFrets, type ChartNote, type InstrumentProfile } from '@lineup/core';
import { computeLaneLayout, flashProgress, hitTimeToX, laneCenterY } from './percussion-lanes';
import { COLORS, type Canvas2D, type RenderSize, type RenderView, type Renderer } from './renderer';

/** Height of the band above the strings where each note's chord and strum direction are written. */
export const HEADER_PX = 24;

/** String colours, indexed like the profile's tuning (ukulele: G C E A). */
const STRING_COLORS = ['#4cc9f0', '#ff9f43', '#c77dff', '#8fb0ff'] as const;

export const stringColor = (tuningIndex: number): string =>
  STRING_COLORS[tuningIndex % STRING_COLORS.length]!;

/** The note letter of a tuning label: "G4" -> "G". */
export const stringName = (label: string): string => label.replace(/\d+$/, '');

/**
 * One row per string, highest string on top like written tab. `tuningIndex` points back into the
 * profile's tuning order, which is also the order of a note's `frets`.
 */
export function stringRows(
  profile: Pick<InstrumentProfile, 'tuning'>,
): { tuningIndex: number; name: string; color: string }[] {
  const strings = profile.tuning?.strings ?? [];
  return strings
    .map((s, tuningIndex) => ({
      tuningIndex,
      name: stringName(s.label),
      color: stringColor(tuningIndex),
    }))
    .reverse();
}

const statusRing = (status: string): string | null =>
  status === 'perfect'
    ? COLORS.perfect
    : status === 'good'
      ? COLORS.good
      : status === 'miss'
        ? COLORS.miss
        : null;

const arrow = (n: ChartNote): string =>
  n.expected?.direction === 'down' ? '↓' : n.expected?.direction === 'up' ? '↑' : '';

/**
 * String lanes ("tab highway"): one horizontal line per string, time scrolling toward a "now"
 * line on the left. Each note shows what to do with the left hand: the fret number to hold on
 * every string it uses (a hollow ring and 0 for an open string). A strum has marks on several
 * strings joined by a bar; a plucked note has one mark. Above the strings, the chord name and
 * the stroke direction are written. Once judged, a note is dimmed and ringed green / yellow /
 * red, and every detected hit flashes the now line.
 */
export class StringLanesRenderer implements Renderer {
  readonly kind = 'lane-highway' as const;

  draw(g: Canvas2D, size: RenderSize, view: RenderView): void {
    const rows = stringRows(view.profile);
    const l = computeLaneLayout(
      { width: size.width, height: size.height - HEADER_PX },
      rows.length,
    );
    const rowY = (row: number): number => HEADER_PX + laneCenterY(l, row);
    const radius = Math.max(6, Math.min(16, l.laneHeight * 0.36));

    g.save();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, size.width, size.height);

    // strings
    g.font = `700 ${Math.max(10, Math.min(15, l.laneHeight * 0.34))}px system-ui, sans-serif`;
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    rows.forEach((row, i) => {
      g.fillStyle = i % 2 === 0 ? COLORS.panel : COLORS.bg;
      g.fillRect(l.left, HEADER_PX + l.top + i * l.laneHeight, size.width - l.left, l.laneHeight);
      g.strokeStyle = row.color;
      g.globalAlpha = 0.45;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(l.left, rowY(i));
      g.lineTo(size.width, rowY(i));
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = row.color;
      g.fillText(row.name, l.left - 10, rowY(i));
    });

    // notes, clipped to the plot
    g.save();
    g.beginPath();
    g.rect(l.left, 0, l.right - l.left, size.height);
    g.clip();
    const rowOfString = new Map(rows.map((r, i) => [r.tuningIndex, i] as const));
    view.notes.forEach((n, i) => {
      const x = hitTimeToX(l, n.t, view.time);
      if (x < l.left - radius * 3 || x > l.right + radius * 3) return;
      const status = view.statuses[i] ?? 'pending';
      const alpha = status === 'pending' ? 1 : status === 'miss' ? 0.4 : 0.55;
      this.drawNote(g, n, x, status, alpha, rowOfString, rowY, rows.length, radius, l.laneHeight);
    });
    g.restore();

    // now line, and a glow for every hit
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(l.nowX, 0);
    g.lineTo(l.nowX, size.height);
    g.stroke();
    g.globalAlpha = 1;
    for (const flash of view.hits ?? []) {
      const p = flashProgress(flash, view.time);
      if (p === null) continue;
      g.globalAlpha = (1 - p) * (0.4 + 0.6 * Math.min(1, Math.max(0, flash.velocity)));
      g.fillStyle = COLORS.active;
      g.shadowColor = COLORS.active;
      g.shadowBlur = 16;
      g.fillRect(l.nowX - 5, 0, 10, size.height);
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }
    g.restore();
  }

  private drawNote(
    g: Canvas2D,
    n: ChartNote,
    x: number,
    status: string,
    alpha: number,
    rowOfString: ReadonlyMap<number, number>,
    rowY: (row: number) => number,
    rowCount: number,
    radius: number,
    laneHeight: number,
  ): void {
    // what is written above the strings: stroke direction and chord
    const label = [arrow(n), n.expected?.chord ?? ''].filter(Boolean).join(' ');
    if (label) {
      g.globalAlpha = alpha;
      g.fillStyle = COLORS.text;
      g.font = '700 13px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, x, HEADER_PX / 2);
    }

    const frets = noteFrets(n);
    const marks: { row: number; color: string; fret: number }[] = [];
    frets?.forEach((fret, tuningIndex) => {
      const row = rowOfString.get(tuningIndex);
      if (fret === null || fret === undefined || row === undefined) return;
      marks.push({ row, color: stringColor(tuningIndex), fret });
    });
    if (marks.length === 0) {
      // nothing to show on the strings (an unknown chord): a bar across them still marks the beat
      g.globalAlpha = alpha * 0.6;
      g.strokeStyle = COLORS.muted;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, rowY(0) - laneHeight / 2);
      g.lineTo(x, rowY(Math.max(0, rowCount - 1)) + laneHeight / 2);
      g.stroke();
      g.globalAlpha = 1;
      return;
    }

    // a strum: one stroke across the strings it uses
    const top = Math.min(...marks.map((m) => m.row));
    const bottom = Math.max(...marks.map((m) => m.row));
    if (top !== bottom) {
      g.globalAlpha = alpha * 0.7;
      g.strokeStyle = COLORS.muted;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, rowY(top));
      g.lineTo(x, rowY(bottom));
      g.stroke();
    }

    g.font = `700 ${Math.max(9, Math.round(radius * 1.05))}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const m of marks) {
      const y = rowY(m.row);
      g.globalAlpha = alpha;
      g.beginPath();
      g.arc(x, y, radius, 0, Math.PI * 2);
      if (m.fret === 0) {
        // open string: a hollow ring
        g.fillStyle = COLORS.bg;
        g.fill();
        g.strokeStyle = m.color;
        g.lineWidth = 2.5;
        g.stroke();
        g.fillStyle = m.color;
      } else {
        g.fillStyle = m.color;
        g.fill();
        g.fillStyle = COLORS.bg;
      }
      g.fillText(String(m.fret), x, y);
      const ring = statusRing(status);
      if (ring) {
        g.globalAlpha = 1;
        g.strokeStyle = ring;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x, y, radius + 2, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}
