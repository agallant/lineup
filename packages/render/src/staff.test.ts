import { chartFromBeats, getProfile } from '@lineup/core';
import { describe, expect, it, vi } from 'vitest';
import { COLORS, type Canvas2D, type RenderView } from './renderer';
import {
  StaffRenderer,
  clefFor,
  letterIndex,
  preferFlats,
  staffName,
  staffStep,
  staffStepFor,
} from './staff';

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
  translate = (...a: unknown[]) => this.rec('translate', a);
  scale = (...a: unknown[]) => this.rec('scale', a);
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

  it('writes a flat key with flats: B♭ is on the B line, not the A line', () => {
    expect(staffName(70, true)).toBe('B♭4');
    expect(staffStep(70, 'treble', true)).toBe(staffStep(71, 'treble', true) + 0); // B♭ and B share a place
    expect(staffStep(70, 'treble', true)).toBe(4);
    expect(staffStep(70, 'treble', false)).toBe(3); // as A♯ it would sit a step lower
    expect(staffName(63, true)).toBe('E♭4');
    expect(staffStepFor(70, 'treble', true)).toBe(4);
    expect(preferFlats(65)).toBe(true); // F major
    expect(preferFlats(70)).toBe(true); // B♭ major
    expect(preferFlats(67)).toBe(false); // G major
    expect(preferFlats(60)).toBe(false);
    expect(preferFlats(undefined)).toBe(false);
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

  it('draws the clef as a shape where the canvas can, not as a letter', () => {
    class FakePath {
      constructor(readonly d: string) {}
    }
    vi.stubGlobal('Path2D', FakePath);
    try {
      const g = new Recorder();
      new StaffRenderer().draw(g as unknown as Canvas2D, size, view());
      expect(g.texts()).not.toContain('G');
      expect(g.texts()).not.toContain('treble');
      const filled = g.calls.filter((c) => c.op === 'fill' && c.args[0] instanceof FakePath);
      expect(filled).toHaveLength(1);
      // flipped, so the font's y-up outline stands the right way round
      const scale = g.calls.find((c) => c.op === 'scale')!;
      expect(Number(scale.args[1])).toBeLessThan(0);
      expect(Number(scale.args[0])).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('names notes the way the instrument does where it has names, and keeps letters for the rest', () => {
    const g = new Recorder();
    const names: Record<number, string> = { 60: 'Ro', 66: 'Tsu' };
    new StaffRenderer({ noteName: (m) => names[m] ?? null }).draw(
      g as unknown as Canvas2D,
      size,
      view(),
    );
    expect(g.texts()).toEqual(expect.arrayContaining(['Ro', 'Tsu']));
    expect(g.texts()).not.toContain('F♯'); // the name replaces the letter, the sign stays
  });

  it('writes an instrument name with the Western name in brackets small beneath it', () => {
    const g = new Recorder();
    const names: Record<number, string> = { 60: 'Ro (C4)', 66: 'Tsu (F♯4)', 72: 'Re (C5)' };
    new StaffRenderer({ noteName: (m) => names[m] ?? null }).draw(
      g as unknown as Canvas2D,
      size,
      view(),
    );
    expect(g.texts()).toEqual(expect.arrayContaining(['Ro', '(C4)', 'Tsu', '(F♯4)', 'Re', '(C5)']));
    expect(g.texts()).not.toContain('Ro (C4)');
  });

  it('leaves a name off when the one before it, being wider, has not left room', () => {
    // a wide name then a narrow one 45 px later: the narrow name alone would fit, but its left edge
    // lands inside the right edge of the wide one
    const close = chartFromBeats({ title: 'T', bpm: 60 }, [
      { beat: 1, beats: 0.3, pitch: 60 },
      { beat: 1.42, beats: 0.3, pitch: 62 },
    ]);
    const names: Record<number, string> = { 60: 'Tsu', 62: 'Ri' };
    const g = new Recorder();
    new StaffRenderer({ noteName: (m) => names[m] ?? null }).draw(
      g as unknown as Canvas2D,
      size,
      view({ notes: close.notes, statuses: close.notes.map(() => 'pending' as const) }),
    );
    expect(g.texts()).toContain('Tsu');
    expect(g.texts()).not.toContain('Ri');
    // far enough apart, both are written
    const apart = chartFromBeats({ title: 'T', bpm: 60 }, [
      { beat: 1, beats: 0.3, pitch: 60 },
      { beat: 2.5, beats: 0.3, pitch: 62 },
    ]);
    const h = new Recorder();
    new StaffRenderer({ noteName: (m) => names[m] ?? null }).draw(
      h as unknown as Canvas2D,
      size,
      view({ notes: apart.notes, statuses: apart.notes.map(() => 'pending' as const) }),
    );
    expect(h.texts()).toEqual(expect.arrayContaining(['Tsu', 'Ri']));
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

  it('marks flats in a flat key and still hides the names on request', () => {
    const flat = chartFromBeats({ title: 'f', bpm: 60 }, [{ beat: 1, beats: 1, pitch: 70 }]);
    const g = new Recorder();
    new StaffRenderer({ names: false, flats: true }).draw(g as unknown as Canvas2D, size, {
      time: 0,
      notes: flat.notes,
      statuses: ['pending'],
      profile: getProfile('voice'),
    });
    expect(g.texts()).toContain('♭');
    expect(g.texts()).not.toContain('B♭');
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
