import type { NoteStatus } from '@lineup/core';
import {
  COLORS,
  roundedRect,
  type Canvas2D,
  type RenderSize,
  type RenderView,
  type Renderer,
} from './renderer';

const BLACK_PC = new Set([1, 3, 6, 8, 10]);
/** Where a black key sits across the gap between its white neighbours (as a fraction of a white key). */
const BLACK_OFFSET: Readonly<Record<number, number>> = {
  1: 0.62,
  3: 0.72,
  6: 0.58,
  8: 0.66,
  10: 0.74,
};
const BLACK_WIDTH = 0.6;
/** Black keys' height as a share of the keyboard's. */
const BLACK_HEIGHT = 0.62;
const LOOK_AHEAD = 4;

/** One key of the keyboard as drawn: its MIDI note, colour and horizontal place in pixels. */
export interface PianoKey {
  midi: number;
  black: boolean;
  x: number;
  w: number;
}

/** True for the black keys. */
export const isBlackKey = (midi: number): boolean => BLACK_PC.has(((midi % 12) + 12) % 12);

/**
 * The keys of a keyboard from `low` to `high` (inclusive, MIDI) laid across `width` pixels, whole
 * octaves from C to B wide so the picture looks like a real keyboard. Black keys sit between the
 * white ones. Returns the range actually drawn along with the keys.
 */
export function pianoKeys(
  low: number,
  high: number,
  width: number,
): { keys: PianoKey[]; from: number; to: number } {
  const from = low - (((low % 12) + 12) % 12); // the C at or below
  const to = high + (11 - (((high % 12) + 12) % 12)); // the B at or above
  const whites: number[] = [];
  for (let m = from; m <= to; m++) if (!isBlackKey(m)) whites.push(m);
  const w = width / whites.length;
  const whiteX = new Map(whites.map((m, i) => [m, i * w] as const));
  const keys: PianoKey[] = [];
  for (let m = from; m <= to; m++) {
    if (!isBlackKey(m)) keys.push({ midi: m, black: false, x: whiteX.get(m)!, w });
    else {
      const below = whiteX.get(m - 1)!;
      const bw = w * BLACK_WIDTH;
      keys.push({
        midi: m,
        black: true,
        x: below + w * BLACK_OFFSET[((m % 12) + 12) % 12]! - bw / 2,
        w: bw,
      });
    }
  }
  return { keys, from, to };
}

/** The keyboard drawn for a chart's notes in a canvas of this size: its keys and its height in pixels. */
export function pianoLayout(
  notes: readonly { pitch?: number | undefined }[],
  size: RenderSize,
): { keys: PianoKey[]; keyboardHeight: number } {
  const pitched = notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch]));
  const low = pitched.length ? Math.min(...pitched) : 60;
  const high = pitched.length ? Math.max(...pitched) : 72;
  // at least two octaves wide, so a small range does not give huge keys
  const span = Math.max(high - low, 23);
  const mid = (low + high) / 2;
  const { keys } = pianoKeys(Math.round(mid - span / 2), Math.round(mid + span / 2), size.width);
  return { keys, keyboardHeight: Math.max(60, Math.min(130, size.height * 0.24)) };
}

/** The key under a point of the canvas (black keys sit on top), or null above the keyboard. */
export function pianoKeyAt(
  keys: readonly PianoKey[],
  keyboardHeight: number,
  size: RenderSize,
  x: number,
  y: number,
): number | null {
  if (y < size.height - keyboardHeight) return null;
  const blackBottom = size.height - keyboardHeight * (1 - BLACK_HEIGHT);
  const hit = (k: PianoKey) => x >= k.x && x < k.x + k.w;
  if (y < blackBottom) {
    const b = keys.find((k) => k.black && hit(k));
    if (b) return b.midi;
  }
  return keys.find((k) => !k.black && hit(k))?.midi ?? null;
}

function noteColor(status: NoteStatus, active: boolean): string {
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

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * A piano roll: the notes fall toward a keyboard along the bottom, each over its own key; a note
 * reaching the keyboard is the moment to press it. Keys held down light up, and the keys of the
 * notes due next are outlined. Judged notes are coloured green, yellow or red.
 */
export class PianoRollRenderer implements Renderer {
  readonly kind = 'piano-roll' as const;

  draw(g: Canvas2D, size: RenderSize, view: RenderView): void {
    const { keys, keyboardHeight: kh } = pianoLayout(view.notes, size);
    const top = size.height - kh;
    const pxPerSec = (top - 6) / LOOK_AHEAD;
    const byMidi = new Map(keys.map((k) => [k.midi, k] as const));
    const pressed = new Set(view.pressed ?? []);
    // the keys of notes arriving within half a second, so the next ones can be found
    const due = new Set<number>();
    view.notes.forEach((n, i) => {
      if (n.pitch !== undefined && (view.statuses[i] ?? 'pending') === 'pending') {
        if (n.t - view.time < 0.5 && n.t + n.duration > view.time - 0.1) due.add(n.pitch);
      }
    });

    g.save();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, size.width, size.height);

    // guide lines at each C, so octaves can be told apart
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    for (const k of keys) {
      if (!k.black && k.midi % 12 === 0) {
        g.beginPath();
        g.moveTo(k.x, 0);
        g.lineTo(k.x, top);
        g.stroke();
      }
    }

    // the falling notes, clipped above the keyboard
    g.save();
    g.beginPath();
    g.rect(0, 0, size.width, top);
    g.clip();
    view.notes.forEach((n, i) => {
      if (n.pitch === undefined) return;
      const key = byMidi.get(n.pitch);
      if (!key) return;
      const d = Math.max(n.duration, 0.25);
      const y1 = top - (n.t - view.time) * pxPerSec; // bottom edge: where it should be pressed
      const y0 = y1 - d * pxPerSec;
      if (y1 < 0 || y0 > top) return;
      const status = view.statuses[i] ?? 'pending';
      const active = view.time >= n.t && view.time < n.t + d;
      g.globalAlpha = status === 'miss' ? 0.5 : status === 'pending' ? 1 : 0.7;
      g.fillStyle = noteColor(status, active);
      const inset = key.black ? 0 : 2;
      roundedRect(g, key.x + inset, y0, key.w - inset * 2, Math.max(8, y1 - y0 - 2), 5);
      g.fill();
      g.globalAlpha = 1;
    });
    g.restore();

    // the keyboard: white keys, then black keys over them
    for (const pass of [false, true]) {
      for (const k of keys) {
        if (k.black !== pass) continue;
        const h = k.black ? kh * BLACK_HEIGHT : kh;
        const down = pressed.has(k.midi);
        g.fillStyle = down ? COLORS.active : k.black ? '#15131f' : '#ece9f7';
        g.fillRect(k.x, top, k.w - (k.black ? 0 : 1), h);
        if (due.has(k.midi) && !down) {
          g.strokeStyle = COLORS.good;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(k.x + 1.5, top + h - 1.5);
          g.lineTo(k.x + k.w - 2.5, top + h - 1.5);
          g.stroke();
        }
        if (!k.black && k.midi % 12 === 0) {
          g.fillStyle = '#14121f';
          g.font = `${Math.max(9, Math.min(12, k.w * 0.45))}px system-ui, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'bottom';
          g.fillText(`${NAMES[0]}${Math.floor(k.midi / 12) - 1}`, k.x + k.w / 2, top + h - 4);
        }
      }
    }

    // the line notes land on
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.6;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, top);
    g.lineTo(size.width, top);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }
}
