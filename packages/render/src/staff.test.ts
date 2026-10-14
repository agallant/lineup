import { chartFromBeats, getProfile } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { COLORS, type Canvas2D, type RenderView } from './renderer';
import { StaffRenderer, clefFor, letterIndex, staffName, staffStep, staffStepFor } from './staff';

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
  texts = () => this.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
  count = (op: string) => this.calls.filter((c) => c.op === op).length;
}

describe('staff positions', () => {
  it('puts E4 on the bottom line of the treble staff and G2 on the bottom line of the bass staff', () => {
    expect(staffStep(64, 'treble')).toBe(0);
    expect(staffStep(77, 'treble')).toBe(8); // F5: the top line
    expect(staffStep(60, 'treble')).toBe(-2); // middle C: the first ledger line below
    expect(staffStep(43, 'bass')).toBe(0);
    expect(staffStep(57, 'bass')).toBe(8); // A3: the top line
    expect(staffStep(60, 'bass')).toBe(10); // middle C: the first ledger line above
  });

  it('puts a sharp on the line or space of its letter', () => {
    expect(staffStep(66, 'treble')).toBe(staffStep(65, 'treble')); // F♯4 and F4 share a place
    expect(letterIndex(61)).toBe(letterIndex(60));
    expect(staffName(61)).toBe('C♯4');
    expect(staffName(60)).toBe('C4');
    expect(staffName(70)).toBe('A♯4');
  });

  it('chooses the bass clef for low melodies', () => {
    const low = chartFromBeats(
      { title: 'l', bpm: 60 },
      [45, 47, 48, 50].map((pitch, i) => ({ beat: i, beats: 1, pitch })),
    );
    const high = chartFromBeats(
      { title: 'h', bpm: 60 },
      [64, 65, 67, 69].map((pitch, i) => ({ beat: i, beats: 1, pitch })),
    );
    expect(clefFor(low.notes)).toBe('bass');
    expect(clefFor(high.notes)).toBe('treble');
    expect(clefFor([])).toBe('treble');
  });

  it('places a fractional pitch between its neighbours', () => {
    expect(staffStepFor(64, 'treble')).toBe(0);
    expect(staffStepFor(64.5, 'treble')).toBeCloseTo(0.5, 5);
    expect(staffStepFor(64.5, 'treble')).toBeLessThan(staffStepFor(65, 'treble'));
  });
});

describe('StaffRenderer', () => {
  const chart = chartFromBeats({ title: 'T', bpm: 60 }, [
    { beat: 1, beats: 1, pitch: 60 },
    { beat: 3, beats: 1, pitch: 66 },
    { beat: 5, beats: 2, pitch: 72 },
  ]);
  const size = { width: 800, height: 400 };
  const view = (over: Partial<RenderView> = {}): RenderView => ({
    time: 0,
    notes: chart.notes,
    statuses: chart.notes.map(() => 'pending' as const),
    profile: getProfile('voice'),
    ...over,
  });

  it('draws five staff lines, a clef, and a notehead for each note on screen', () => {
    const g = new Recorder();
    new StaffRenderer().draw(g as unknown as Canvas2D, size, view());
    expect(g.texts()).toContain('G');
    expect(g.count('arc')).toBe(3);
    // five lines + ledger line(s) for middle C + stems + the now line
    expect(g.count('stroke')).toBeGreaterThanOrEqual(5 + 1 + 3 + 1);
  });

  it('shows note names unless asked to hide them, and always marks a sharp', () => {
    const shown = new Recorder();
    new StaffRenderer({ names: true }).draw(shown as unknown as Canvas2D, size, view());
    expect(shown.texts()).toEqual(expect.arrayContaining(['C', 'F♯', 'C']));
    const hidden = new Recorder();
    new StaffRenderer({ names: false }).draw(hidden as unknown as Canvas2D, size, view());
    expect(hidden.texts()).not.toContain('C');
    expect(hidden.texts()).not.toContain('F♯');
    expect(hidden.texts()).toContain('♯'); // the sharp sign is part of the music, not a label
  });

  it('colours judged notes and draws the trail', () => {
    const g = new Recorder();
    new StaffRenderer().draw(
      g as unknown as Canvas2D,
      size,
      view({
        statuses: ['perfect', 'miss', 'pending'],
        trail: [
          { time: 0.9, midi: 60, onPitch: true },
          { time: 0.95, midi: 60.5, onPitch: true },
        ],
      }),
    );
    expect(g.calls.some((c) => c.op === 'fill' && c.fill === COLORS.perfect)).toBe(true);
    expect(g.calls.some((c) => c.op === 'fill' && c.fill === COLORS.miss)).toBe(true);
  });

  it('skips notes that are off screen and does not fail on a chart with no pitches', () => {
    const g = new Recorder();
    new StaffRenderer().draw(g as unknown as Canvas2D, size, view({ time: 1000 }));
    expect(g.count('arc')).toBe(0);
    const empty = new Recorder();
    expect(() =>
      new StaffRenderer().draw(
        empty as unknown as Canvas2D,
        size,
        view({ notes: [], statuses: [] }),
      ),
    ).not.toThrow();
  });
});
