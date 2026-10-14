import type { ChartNote } from '@lineup/core';
import { COLORS, type Canvas2D, type RenderSize, type RenderView, type Renderer } from './renderer';

/** Which clef the staff is drawn with. */
export type Clef = 'treble' | 'bass';

/** Letter of each pitch class and whether it is a sharp (a sharp sits on the letter below). */
const LETTER_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6] as const;
const SHARP_PC = new Set([1, 3, 6, 8, 10]);
const LETTER_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/** Diatonic steps (letters) up from C-1 for a MIDI pitch, a sharp counted on the letter below. */
export function letterIndex(midi: number): number {
  const pc = ((midi % 12) + 12) % 12;
  return Math.floor(midi / 12) * 7 + LETTER_OF_PC[pc]!;
}

/** The note's letter name with its octave and a sharp sign, e.g. "F♯4". */
export function staffName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${LETTER_NAMES[LETTER_OF_PC[pc]!]}${SHARP_PC.has(pc) ? '♯' : ''}${octave}`;
}

/** Steps from the bottom line of the staff: the bottom line is 0, each line or space above is one more. */
export function staffStep(midi: number, clef: Clef): number {
  // E4 sits on the bottom line of the treble staff, G2 on the bottom line of the bass staff
  return letterIndex(midi) - letterIndex(clef === 'treble' ? 64 : 43);
}

/** The clef that suits a melody: bass when most of its notes lie below the treble staff. */
export function clefFor(notes: readonly ChartNote[]): Clef {
  const pitches = notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch]));
  if (pitches.length === 0) return 'treble';
  const sorted = [...pitches].sort((a, b) => a - b);
  return sorted[sorted.length >> 1]! < 57 ? 'bass' : 'treble';
}

/** The vertical position of a fractional pitch, in staff steps, interpolating between semitones. */
export function staffStepFor(midi: number, clef: Clef): number {
  const lo = Math.floor(midi);
  const a = staffStep(lo, clef);
  const b = staffStep(lo + 1, clef);
  // a semitone that stays on the same letter (C to C♯) has no height of its own; spread the climb evenly
  return a + (b - a) * (midi - lo);
}

function statusColor(status: RenderView['statuses'][number], active: boolean): string {
  switch (status) {
    case 'perfect':
      return COLORS.perfect;
    case 'good':
      return COLORS.good;
    case 'miss':
      return COLORS.miss;
    default:
      return active ? COLORS.active : COLORS.text;
  }
}

/** Options for the staff view. */
export interface StaffOptions {
  /** Write each note's letter name beside its notehead. Off, the player reads the staff. */
  names?: boolean;
  /** Seconds of the future visible to the right of the now line. */
  lookAhead?: number;
  nowFraction?: number;
}

/**
 * The song as written music: five lines, the notes as noteheads scrolling toward the now line, a bar
 * behind each for how long it lasts, and the player's own pitch as a live trail. Note names can be
 * hidden, to learn to read the staff.
 */
export class StaffRenderer implements Renderer {
  readonly kind = 'pitch-highway' as const;

  constructor(private readonly options: StaffOptions = {}) {}

  draw(g: Canvas2D, size: RenderSize, view: RenderView): void {
    const { names = true, lookAhead = 5, nowFraction = 0.28 } = this.options;
    const clef = clefFor(view.notes);
    const left = 54;
    const nowX = left + (size.width - left) * nowFraction;
    const pxPerSec = (size.width - nowX) / lookAhead;
    // the staff is five lines with room above and below for ledger lines and the trail
    const gap = Math.max(10, Math.min(30, size.height / 12));
    const bottomY = size.height / 2 + gap * 2;
    const yOf = (step: number) => bottomY - (step * gap) / 2;
    const xOf = (t: number) => nowX + (t - view.time) * pxPerSec;

    g.save();
    g.fillStyle = COLORS.bg;
    g.fillRect(0, 0, size.width, size.height);

    // the five lines and the clef
    g.strokeStyle = COLORS.muted;
    g.lineWidth = 1.5;
    for (let line = 0; line < 5; line++) {
      const y = yOf(line * 2);
      g.beginPath();
      g.moveTo(left - 8, y);
      g.lineTo(size.width, y);
      g.stroke();
    }
    g.fillStyle = COLORS.text;
    g.font = `italic 700 ${Math.round(gap * 3.2)}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(clef === 'treble' ? 'G' : 'F', left / 2, yOf(clef === 'treble' ? 2 : 6));
    g.font = `${Math.max(9, Math.round(gap * 0.8))}px system-ui, sans-serif`;
    g.fillText(clef === 'treble' ? 'treble' : 'bass', left / 2, yOf(-3));

    // everything that scrolls stays right of the clef
    g.save();
    g.beginPath();
    g.rect(left, 0, size.width - left, size.height);
    g.clip();

    const head = gap * 0.62;
    view.notes.forEach((n, i) => {
      if (n.pitch === undefined) return;
      const d = Math.max(n.duration, 0.2);
      const x0 = xOf(n.t);
      const x1 = xOf(n.t + d);
      if (x1 < left || x0 > size.width) return;
      const step = staffStep(n.pitch, clef);
      const y = yOf(step);
      const status = view.statuses[i] ?? 'pending';
      const active = view.time >= n.t && view.time < n.t + d;
      const color = statusColor(status, active);
      g.globalAlpha = status === 'miss' ? 0.55 : status === 'pending' ? 1 : 0.75;

      // ledger lines above and below the staff
      g.strokeStyle = COLORS.muted;
      g.lineWidth = 1.5;
      const ledgers: number[] = [];
      for (let s = -2; s >= step; s -= 2) ledgers.push(s);
      for (let s = 10; s <= step; s += 2) ledgers.push(s);
      for (const s of ledgers) {
        g.beginPath();
        g.moveTo(x0 - head * 1.5, yOf(s));
        g.lineTo(x0 + head * 1.5, yOf(s));
        g.stroke();
      }

      // how long the note lasts: a bar from the notehead to its end
      g.fillStyle = color;
      g.globalAlpha *= 0.45;
      g.fillRect(x0, y - 2, Math.max(0, x1 - x0 - 2), 4);
      g.globalAlpha = status === 'miss' ? 0.55 : status === 'pending' ? 1 : 0.75;

      // the notehead, and a stem
      g.beginPath();
      g.arc(x0, y, head, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      if (step < 6) {
        g.moveTo(x0 + head - 1, y);
        g.lineTo(x0 + head - 1, y - gap * 3);
      } else {
        g.moveTo(x0 - head + 1, y);
        g.lineTo(x0 - head + 1, y + gap * 3);
      }
      g.stroke();

      g.fillStyle = COLORS.text;
      g.font = `600 ${Math.max(10, Math.round(gap * 0.95))}px system-ui, sans-serif`;
      g.textBaseline = 'middle';
      if (staffName(n.pitch).includes('♯')) {
        g.textAlign = 'right';
        g.fillText('♯', x0 - head - 2, y);
      }
      if (names) {
        g.textAlign = 'center';
        g.fillStyle = COLORS.muted;
        g.fillText(staffName(n.pitch).replace(/\d/, ''), x0, y + head + gap * 0.9);
      }
      g.globalAlpha = 1;
    });

    // the player's pitch as a line through the staff
    const trail = view.trail;
    if (trail && trail.length > 0) {
      g.lineCap = 'round';
      g.lineJoin = 'round';
      let prev: (typeof trail)[number] | null = null;
      for (const p of trail) {
        if (p.midi === null) {
          prev = null;
          continue;
        }
        if (prev && prev.midi !== null && p.time - prev.time < 0.08) {
          g.strokeStyle = p.onPitch ? COLORS.trailOn : COLORS.trailOff;
          g.lineWidth = 4;
          g.beginPath();
          g.moveTo(xOf(prev.time), yOf(staffStepFor(prev.midi, clef)));
          g.lineTo(xOf(p.time), yOf(staffStepFor(p.midi, clef)));
          g.stroke();
        }
        prev = p;
      }
    }
    g.restore();

    // the now line
    g.strokeStyle = COLORS.text;
    g.globalAlpha = 0.5;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(nowX, 0);
    g.lineTo(nowX, size.height);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }
}
