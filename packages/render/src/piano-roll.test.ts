import { chartFromBeats, getProfile } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { PianoRollRenderer, isBlackKey, pianoKeyAt, pianoKeys, pianoLayout } from './piano-roll';
import { COLORS, createRenderer } from './index';
import type { Canvas2D, RenderView } from './renderer';

class Recorder {
  calls: { op: string; args: unknown[]; fill: string }[] = [];
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
    this.calls.push({ op, args, fill: String(this.fillStyle) });
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
  fillsWith = (c: string) => this.calls.filter((x) => x.op === 'fill' && x.fill === c).length;
  rectsWith = (c: string) => this.calls.filter((x) => x.op === 'fillRect' && x.fill === c).length;
}

describe('pianoKeys', () => {
  it('lays whole octaves from C to B across the width, with black keys between the white ones', () => {
    const { keys, from, to } = pianoKeys(60, 71, 700);
    expect(from).toBe(60);
    expect(to).toBe(71);
    expect(keys).toHaveLength(12);
    const whites = keys.filter((k) => !k.black);
    expect(whites).toHaveLength(7);
    expect(whites[0]!.w).toBeCloseTo(100, 5);
    expect(whites.map((k) => Math.round(k.x))).toEqual([0, 100, 200, 300, 400, 500, 600]);
    const cSharp = keys.find((k) => k.midi === 61)!;
    expect(cSharp.black).toBe(true);
    expect(cSharp.x).toBeGreaterThan(whites[0]!.x);
    expect(cSharp.x + cSharp.w).toBeLessThan(whites[1]!.x + whites[1]!.w);
    expect(cSharp.w).toBeLessThan(whites[0]!.w);
  });

  it('widens to whole octaves around a range that is not', () => {
    const { from, to } = pianoKeys(64, 67, 400);
    expect(from).toBe(60);
    expect(to).toBe(67 + 4); // up to the next B
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
  });
});

describe('PianoRollRenderer', () => {
  const chart = chartFromBeats({ title: 'k', bpm: 60 }, [
    { beat: 1, beats: 1, pitch: 60 },
    { beat: 2, beats: 1, pitch: 61 },
    { beat: 3, beats: 2, pitch: 67 },
  ]);
  const size = { width: 800, height: 500 };
  const view = (over: Partial<RenderView> = {}): RenderView => ({
    time: 0,
    notes: chart.notes,
    statuses: chart.notes.map(() => 'pending' as const),
    profile: getProfile('keyboard'),
    ...over,
  });

  it('is what the keyboard profile asks for', () => {
    expect(getProfile('keyboard').renderer).toBe('piano-roll');
    expect(createRenderer('piano-roll')).toBeInstanceOf(PianoRollRenderer);
  });

  it('draws the keyboard and a falling bar for each note on screen', () => {
    const g = new Recorder();
    new PianoRollRenderer().draw(g as unknown as Canvas2D, size, view());
    // white keys are light, black keys dark
    expect(g.rectsWith('#ece9f7')).toBeGreaterThanOrEqual(14);
    expect(g.rectsWith('#15131f')).toBeGreaterThanOrEqual(10);
    // three falling notes, all pending: filled in the pending (or active) colour
    expect(g.fillsWith(COLORS.pending) + g.fillsWith(COLORS.active)).toBe(3);
  });

  it('lights the keys that are held, and colours judged notes', () => {
    const g = new Recorder();
    new PianoRollRenderer().draw(
      g as unknown as Canvas2D,
      size,
      view({ pressed: [60], statuses: ['perfect', 'miss', 'pending'] }),
    );
    expect(g.rectsWith(COLORS.active)).toBe(1);
    expect(g.fillsWith(COLORS.perfect)).toBe(1);
    expect(g.fillsWith(COLORS.miss)).toBe(1);
  });

  it('skips notes that are not yet in view, and handles a chart with no pitches', () => {
    const g = new Recorder();
    new PianoRollRenderer().draw(g as unknown as Canvas2D, size, view({ time: -100 }));
    expect(g.fillsWith(COLORS.pending)).toBe(0);
    const empty = new Recorder();
    expect(() =>
      new PianoRollRenderer().draw(
        empty as unknown as Canvas2D,
        size,
        view({ notes: [], statuses: [] }),
      ),
    ).not.toThrow();
  });
});

describe('pianoLayout / pianoKeyAt', () => {
  const size = { width: 700, height: 500 };
  const notes = [{ pitch: 60 }, { pitch: 72 }];
  it('finds the key under a point, black keys first', () => {
    const { keys, keyboardHeight } = pianoLayout(notes, size);
    const c = keys.find((k) => k.midi === 60)!;
    const cs = keys.find((k) => k.midi === 61)!;
    const low = size.height - 5;
    const high = size.height - keyboardHeight + 5;
    expect(pianoKeyAt(keys, keyboardHeight, size, c.x + 2, low)).toBe(60);
    expect(pianoKeyAt(keys, keyboardHeight, size, cs.x + cs.w / 2, high)).toBe(61);
    // the same x lower down is the white key beneath the black one
    expect(pianoKeyAt(keys, keyboardHeight, size, cs.x + cs.w / 2, low)).not.toBe(61);
  });
  it('is null above the keyboard', () => {
    const { keys, keyboardHeight } = pianoLayout(notes, size);
    expect(pianoKeyAt(keys, keyboardHeight, size, 100, 10)).toBeNull();
  });
});
