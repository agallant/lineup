import type { Voicing } from '@lineup/core';

/** The fret rows a diagram shows below the nut (or below its first fret label). */
const ROWS = 5;
const W = 122;
const LEFT = 32;
const RIGHT = 14;
const TOP = 30;
const ROW_H = 20;

/**
 * A chord fingering as a small picture: strings standing up (lowest on the left), fret lines across,
 * a dot where a string is held, a ring above an open string, a cross above a muted one, a bar
 * across a barre, and the fret number to the left of the first row when the shape sits up the neck.
 * The colours come from the page (`currentColor` and the accent), so it suits both themes.
 */
export function chordDiagramSvg(voicing: Voicing, label: string): string {
  const { frets } = voicing;
  const held = frets.filter((f): f is number => f !== null && f > 0);
  const lowest = held.length > 0 ? Math.min(...held) : 1;
  const highest = held.length > 0 ? Math.max(...held) : 1;
  // sit on the nut when the shape fits in the first five frets, else start at its lowest fret
  const start = highest <= ROWS ? 1 : lowest;
  const n = frets.length;
  const gap = (W - LEFT - RIGHT) / (n - 1);
  const x = (s: number): number => LEFT + s * gap;
  const y = (row: number): number => TOP + row * ROW_H;
  const height = y(ROWS) + 12;
  const parts: string[] = [];
  // fret lines (the first is the nut when the shape is in first position)
  for (let r = 0; r <= ROWS; r++) {
    const nut = r === 0 && start === 1;
    parts.push(
      `<line x1="${x(0)}" y1="${y(r)}" x2="${x(n - 1)}" y2="${y(r)}" stroke="currentColor" stroke-width="${nut ? 3 : 1}" opacity="${nut ? 1 : 0.5}"/>`,
    );
  }
  for (let s = 0; s < n; s++) {
    parts.push(
      `<line x1="${x(s)}" y1="${y(0)}" x2="${x(s)}" y2="${y(ROWS)}" stroke="currentColor" stroke-width="1" opacity="0.7"/>`,
    );
  }
  frets.forEach((f, s) => {
    if (f === null) {
      parts.push(
        `<text x="${x(s)}" y="${y(0) - 8}" text-anchor="middle" font-size="13" fill="currentColor">×</text>`,
      );
    } else if (f === 0) {
      parts.push(
        `<circle cx="${x(s)}" cy="${y(0) - 12}" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
      );
    }
  });
  if (voicing.barre) {
    const at = frets.flatMap((f, s) => (f === lowest ? [s] : []));
    const row = lowest - start;
    parts.push(
      `<rect x="${x(at[0]!) - 6}" y="${y(row) + 4}" width="${x(at[at.length - 1]!) - x(at[0]!) + 12}" height="${ROW_H - 8}" rx="6" fill="var(--accent, currentColor)" opacity="0.85"/>`,
    );
  }
  frets.forEach((f, s) => {
    if (f === null || f === 0) return;
    const row = f - start;
    if (row < 0 || row >= ROWS) return;
    parts.push(
      `<circle cx="${x(s)}" cy="${y(row) + ROW_H / 2}" r="6.5" fill="var(--accent, currentColor)"/>`,
    );
  });
  if (start > 1) {
    parts.push(
      `<text x="${LEFT - 12}" y="${y(0) + ROW_H / 2 + 4}" text-anchor="end" font-size="12" fill="currentColor">${start}fr</text>`,
    );
  }
  const text = frets.map((f) => (f === null ? 'x' : String(f))).join(' ');
  return `<svg viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-label="${label}: ${text}" class="chord-diagram">${parts.join('')}</svg>`;
}
