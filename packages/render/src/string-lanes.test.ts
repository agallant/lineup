import { getProfile, type ChartNote, type NoteStatus } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { FLASH_SECONDS, computeLaneLayout, hitTimeToX, laneCenterY } from './percussion-lanes';
import { createRenderer } from './pitch-highway';
import { COLORS, type Canvas2D, type HitFlash, type RenderView } from './renderer';
import {
  HEADER_PX,
  StringLanesRenderer,
  stringColor,
  stringName,
  stringRows,
} from './string-lanes';

class Recorder {
  calls: { op: string; args: unknown[]; fill: string; stroke: string; alpha: number }[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  font = '';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = '';
  private rec(op: string, args: unknown[]) {
    this.calls.push({
      op,
      args,
      fill: String(this.fillStyle),
      stroke: String(this.strokeStyle),
      alpha: this.globalAlpha,
    });
  }
  save = (...a: unknown[]) => this.rec('save', a);
  restore = (...a: unknown[]) => this.rec('restore', a);
  beginPath = (...a: unknown[]) => this.rec('beginPath', a);
  moveTo = (...a: unknown[]) => this.rec('moveTo', a);
  lineTo = (...a: unknown[]) => this.rec('lineTo', a);
  arcTo = (...a: unknown[]) => this.rec('arcTo', a);
  arc = (...a: unknown[]) => this.rec('arc', a);
  closePath = (...a: unknown[]) => this.rec('closePath', a);
  stroke = (...a: unknown[]) => this.rec('stroke', a);
  fill = (...a: unknown[]) => this.rec('fill', a);
  fillRect = (...a: unknown[]) => this.rec('fillRect', a);
  fillText = (...a: unknown[]) => this.rec('fillText', a);
  clip = (...a: unknown[]) => this.rec('clip', a);
  rect = (...a: unknown[]) => this.rec('rect', a);

  /** Every disc (an arc that is filled), with its fill colour. */
  discs() {
    const out: { x: number; y: number; r: number; fill: string }[] = [];
    this.calls.forEach((c, i) => {
      if (c.op === 'arc' && this.calls[i + 1]?.op === 'fill')
        out.push({
          x: c.args[0] as number,
          y: c.args[1] as number,
          r: c.args[2] as number,
          fill: this.calls[i + 1]!.fill,
        });
    });
    return out;
  }
  /** Arcs that are stroked (the judged-note rings and the open-string rings), with their colour. */
  rings() {
    const out: { x: number; y: number; r: number; stroke: string }[] = [];
    this.calls.forEach((c, i) => {
      if (c.op === 'arc' && this.calls[i + 1]?.op === 'stroke')
        out.push({
          x: c.args[0] as number,
          y: c.args[1] as number,
          r: c.args[2] as number,
          stroke: this.calls[i + 1]!.stroke,
        });
    });
    return out;
  }
  /** Hollow rings: an arc filled with the background, then outlined (the open strings). */
  hollow() {
    const out: { x: number; y: number; stroke: string }[] = [];
    this.calls.forEach((c, i) => {
      if (c.op === 'arc' && this.calls[i + 1]?.op === 'fill' && this.calls[i + 2]?.op === 'stroke')
        out.push({
          x: c.args[0] as number,
          y: c.args[1] as number,
          stroke: this.calls[i + 2]!.stroke,
        });
    });
    return out;
  }
  texts() {
    return this.calls
      .filter((c) => c.op === 'fillText')
      .map((c) => ({
        text: String(c.args[0]),
        x: c.args[1] as number,
        y: c.args[2] as number,
        fill: c.fill,
      }));
  }
  /** Vertical strokes at an x: a moveTo and lineTo with that x and different y's. */
  verticalLines(x: number) {
    const out: [number, number][] = [];
    this.calls.forEach((c, i) => {
      const next = this.calls[i + 1];
      if (c.op === 'moveTo' && next?.op === 'lineTo' && c.args[0] === x && next.args[0] === x)
        out.push([c.args[1] as number, next.args[1] as number]);
    });
    return out;
  }
}
const asCanvas = (r: Recorder) => r as unknown as Canvas2D;

const profile = getProfile('ukulele-strum');
const SIZE = { width: 800, height: 300 };
const note = (t: number, expected?: ChartNote['expected']): ChartNote => ({
  t,
  duration: 0,
  ...(expected ? { expected } : {}),
});

const view = (notes: ChartNote[], over: Partial<RenderView> = {}): RenderView => ({
  time: 0,
  notes,
  statuses: notes.map((): NoteStatus => 'pending'),
  profile,
  ...over,
});

const layout = computeLaneLayout({ width: SIZE.width, height: SIZE.height - HEADER_PX }, 4);
const noteX = (t: number) => hitTimeToX(layout, t, 0);
const rowY = (row: number) => HEADER_PX + laneCenterY(layout, row);

const draw = (v: RenderView, size = SIZE) => {
  const g = new Recorder();
  new StringLanesRenderer().draw(asCanvas(g), size, v);
  return g;
};

describe('stringRows', () => {
  it('lists the strings highest first, like tab, remembering their place in the tuning', () => {
    expect(stringRows(profile).map((r) => [r.name, r.tuningIndex])).toEqual([
      ['A', 3],
      ['E', 2],
      ['C', 1],
      ['G', 0],
    ]);
  });

  it('gives each string its own colour, and none for a profile without a tuning', () => {
    expect(new Set(stringRows(profile).map((r) => r.color)).size).toBe(4);
    expect(stringColor(0)).toBe(stringRows(profile).find((r) => r.name === 'G')!.color);
    expect(stringRows({})).toEqual([]);
  });

  it('writes the note letter without its octave', () => {
    expect(stringName('G4')).toBe('G');
    expect(stringName('Bb2')).toBe('Bb');
    expect(stringName('E')).toBe('E');
  });
});

describe('StringLanesRenderer', () => {
  it('labels the four strings A E C G from the top, each in its colour', () => {
    const labels = draw(view([])).texts();
    expect(labels.map((t) => t.text)).toEqual(['A', 'E', 'C', 'G']);
    expect(labels.map((t) => t.y)).toEqual([0, 1, 2, 3].map(rowY));
    expect(labels.map((t) => t.fill)).toEqual(stringRows(profile).map((r) => r.color));
  });

  it('writes the fret to hold on each string for a chord, highest string on top', () => {
    // C: G 0, C 0, E 0, A 3
    const g = draw(view([note(1, { chord: 'C', direction: 'down' })]));
    const x = noteX(1);
    const marks = g
      .texts()
      .filter((t) => t.x === x && /^\d$/.test(t.text))
      .sort((p, q) => p.y - q.y);
    expect(marks.map((t) => [t.text, t.y])).toEqual([
      ['3', rowY(0)], // A string, the top line
      ['0', rowY(1)],
      ['0', rowY(2)],
      ['0', rowY(3)], // G string, the bottom line
    ]);
    expect(g.discs().filter((d) => d.x === x)).toHaveLength(4);
  });

  it('joins a strum with a bar across the strings it uses', () => {
    const g = draw(view([note(1, { chord: 'C' })]));
    expect(g.verticalLines(noteX(1))).toContainEqual([rowY(0), rowY(3)]);
  });

  it('draws open strings as hollow rings and fretted strings as filled discs', () => {
    const g = draw(view([note(1, { chord: 'C' })]));
    const x = noteX(1);
    const discs = g.discs().filter((d) => d.x === x);
    // the A-string fret 3 is filled with the string's colour; the open strings are filled with the
    // background and outlined in theirs
    expect(discs.find((d) => d.y === rowY(0))!.fill).toBe(stringColor(3));
    for (const row of [1, 2, 3]) expect(discs.find((d) => d.y === rowY(row))!.fill).toBe(COLORS.bg);
    const outlines = g
      .hollow()
      .filter((r) => r.x === x)
      .sort((p, q) => p.y - q.y);
    expect(outlines.map((r) => r.stroke)).toEqual([stringColor(2), stringColor(1), stringColor(0)]);
  });

  it('shows a plucked note as a single mark with no bar and nothing on the other strings', () => {
    const g = draw(view([note(1, { frets: [null, 0, null, null] })])); // the C string, open
    const x = noteX(1);
    expect(g.discs().filter((d) => d.x === x)).toHaveLength(1);
    expect(g.discs().find((d) => d.x === x)!.y).toBe(rowY(2)); // C is the third line from the top
    expect(g.verticalLines(x)).toEqual([]);
    expect(g.texts().filter((t) => t.x === x)).toEqual([expect.objectContaining({ text: '0' })]);
  });

  it("uses the chart's own frets over the chord's, and leaves unplayed strings blank", () => {
    const g = draw(view([note(1, { chord: 'C', frets: [null, 2, null, 1] })]));
    const x = noteX(1);
    expect(
      g
        .texts()
        .filter((t) => t.x === x && /^\d$/.test(t.text))
        .map((t) => t.text)
        .sort(),
    ).toEqual(['1', '2']);
  });

  it('writes the stroke direction and chord above the strings', () => {
    const g = draw(
      view([
        note(1, { chord: 'Am', direction: 'down' }),
        note(2, { chord: 'F', direction: 'up' }),
        note(3, { chord: 'G' }),
        note(4, { frets: [null, 0, null, null] }),
      ]),
    );
    const header = g.texts().filter((t) => t.y === HEADER_PX / 2);
    expect(header.map((t) => t.text)).toEqual(['↓ Am', '↑ F', 'G']);
  });

  it('draws a bar and no discs for a chord it has no fingering for', () => {
    const g = draw(view([note(1, { chord: 'Zzz' })]));
    expect(g.discs().filter((d) => d.x === noteX(1))).toHaveLength(0);
    expect(g.verticalLines(noteX(1))).toHaveLength(1);
  });

  it('rings every mark of a judged note green / yellow / red and dims it', () => {
    const notes = [note(1, { chord: 'C' }), note(2, { chord: 'C' }), note(3, { chord: 'C' })];
    const g = draw(view(notes, { statuses: ['perfect', 'good', 'miss'] }));
    for (const [t, color] of [
      [1, COLORS.perfect],
      [2, COLORS.good],
      [3, COLORS.miss],
    ] as const) {
      const rings = g
        .rings()
        .filter((r) => r.x === noteX(t) && r.stroke === color && r.r > layout.radius * 0.5);
      expect(rings.length, `t=${t}`).toBe(4);
    }
    const dimmed = g.calls.filter((c) => c.op === 'fill' && c.alpha < 1);
    expect(dimmed.length).toBeGreaterThan(0);
  });

  it('skips notes that scrolled off either side', () => {
    const g = draw(view([note(-5), note(60), note(1, { chord: 'C' })].map((n) => ({ ...n }))));
    const xs = new Set(g.discs().map((d) => d.x));
    expect([...xs]).toEqual([noteX(1)]);
  });

  it('flashes the now line for a hit and stops after FLASH_SECONDS', () => {
    const hit: HitFlash = { time: 1, lane: '*', velocity: 1 };
    const glowAt = (time: number) =>
      draw(view([], { time, hits: [hit] })).calls.filter(
        (c) => c.op === 'fillRect' && (c.args[2] as number) === 10,
      );
    expect(glowAt(1.05)).toHaveLength(1);
    expect(glowAt(1.05)[0]!.alpha).toBeLessThan(1);
    expect(glowAt(1 + FLASH_SECONDS + 0.01)).toHaveLength(0);
    expect(glowAt(0.5)).toHaveLength(0);
  });

  it('survives a profile without a tuning and a tiny canvas', () => {
    const bare = { ...profile };
    delete bare.tuning;
    expect(() => draw(view([note(1, { chord: 'C' })], { profile: bare }))).not.toThrow();
    expect(() => draw(view([note(1, { chord: 'C' })]), { width: 40, height: 20 })).not.toThrow();
  });

  it('createRenderer builds it for the Strumline profile', () => {
    expect(profile.renderer).toBe('lane-highway');
    expect(createRenderer(profile.renderer)).toBeInstanceOf(StringLanesRenderer);
  });
});
