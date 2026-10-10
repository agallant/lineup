import { chartFromBeats, getProfile, type NoteStatus } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  PitchHighwayRenderer,
  computeLayout,
  createRenderer,
  describePitch,
  midiName,
  midiToY,
  pitchRangeFor,
  pxPerSemitone,
  timeToX,
} from './pitch-highway';
import { COLORS, roundedRect, type Canvas2D, type RenderView } from './renderer';
import { PitchTrail, foldMidiNear } from './trail';

/** A recording stand-in for CanvasRenderingContext2D. */
class Recorder {
  calls: { op: string; args: unknown[]; fill: string; stroke: string }[] = [];
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
    this.calls.push({ op, args, fill: String(this.fillStyle), stroke: String(this.strokeStyle) });
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
  count(op: string): number {
    return this.calls.filter((c) => c.op === op).length;
  }
  fillsWith(color: string): number {
    return this.calls.filter((c) => c.op === 'fill' && c.fill === color).length;
  }
  texts(): string[] {
    return this.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
  }
}
const asCanvas = (r: Recorder) => r as unknown as Canvas2D;

const profile = getProfile('voice');
const chart = chartFromBeats({ title: 'T', bpm: 60 }, [
  { beat: 1, beats: 1, pitch: 60 },
  { beat: 3, beats: 1, pitch: 64 },
  { beat: 5, beats: 2, pitch: 67 },
  { beat: 100, beats: 1, pitch: 72 }, // far in the future: off screen
]);
const SIZE = { width: 800, height: 400 };

function view(over: Partial<RenderView> = {}): RenderView {
  return {
    time: 0,
    notes: chart.notes,
    statuses: chart.notes.map(() => 'pending' as NoteStatus),
    profile,
    ...over,
  };
}

describe('pitchRangeFor', () => {
  it('adds a margin and expands to the minimum span, centred', () => {
    expect(pitchRangeFor(chart.notes.slice(0, 1))).toEqual({ low: 53, high: 67 }); // 60 +-2 -> span 4 -> 14 centred on 60
  });

  it('uses the full range plus margin when it is wide', () => {
    expect(pitchRangeFor(chart.notes)).toEqual({ low: 58, high: 74 });
  });

  it('has a sane default for a chart with no pitches', () => {
    const r = pitchRangeFor([{ t: 0, duration: 0 }]);
    expect(r.high - r.low).toBe(14);
  });
});

describe('layout math', () => {
  const l = computeLayout(SIZE, chart.notes);

  it('puts the now line at 28% of the plot and fits the look-ahead on the right', () => {
    expect(l.nowX).toBeCloseTo(34 + (800 - 34) * 0.28, 9);
    expect(timeToX(l, 5, 0)).toBeCloseTo(800, 9); // lookAhead = 5 s lands on the right edge
    expect(timeToX(l, 0, 0)).toBe(l.nowX);
  });

  it('time scrolls right to left: later = larger x, and moving the clock shifts everything left', () => {
    expect(timeToX(l, 2, 0)).toBeGreaterThan(timeToX(l, 1, 0));
    expect(timeToX(l, 2, 1)).toBeCloseTo(timeToX(l, 1, 0), 9);
  });

  it('maps pitch to y with higher pitch higher on screen and the range filling the plot', () => {
    expect(midiToY(l, l.lowMidi)).toBeCloseTo(l.bottom, 9);
    expect(midiToY(l, l.highMidi)).toBeCloseTo(l.top, 9);
    expect(midiToY(l, 64)).toBeLessThan(midiToY(l, 60));
    expect(midiToY(l, 61) - midiToY(l, 62)).toBeCloseTo(pxPerSemitone(l), 9);
  });

  it('reports how much past is visible', () => {
    expect(l.lookBehind).toBeCloseTo((l.nowX - l.left) / l.pxPerSec, 9);
  });
});

describe('PitchHighwayRenderer.draw', () => {
  const renderer = new PitchHighwayRenderer();

  it('draws pending notes in the pending colour and skips notes far off screen', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view());
    expect(g.fillsWith(COLORS.pending)).toBe(3); // 3 visible notes, the 4th is 100 s away
  });

  it('colours judged notes by result', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view({ statuses: ['perfect', 'good', 'miss', 'pending'] }));
    expect(g.fillsWith(COLORS.perfect)).toBe(1);
    expect(g.fillsWith(COLORS.good)).toBe(1);
    expect(g.fillsWith(COLORS.miss)).toBe(1);
  });

  it('highlights the active note, and glows green while the singer is on pitch', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view({ time: 1.5 }));
    expect(g.fillsWith(COLORS.active)).toBe(1);
    const h = new Recorder();
    renderer.draw(
      asCanvas(h),
      SIZE,
      view({ time: 1.5, live: { noteIndex: 0, onPitch: true, coverage: 0.5 } }),
    );
    expect(h.fillsWith(COLORS.trailOn)).toBe(1);
    expect(h.fillsWith(COLORS.active)).toBe(0);
  });

  it('labels notes with their names when they are wide enough', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view());
    const names = g.texts();
    // each visible note adds a label on top of the gutter's grid label; the off-screen C5 note adds none
    expect(names.filter((t) => t === 'C4')).toHaveLength(2);
    expect(names.filter((t) => t === 'E4')).toHaveLength(2);
    expect(names.filter((t) => t === 'G4')).toHaveLength(2);
    expect(names.filter((t) => t === 'C5')).toHaveLength(1);
  });

  it('draws the trail: green when on pitch, orange when not, and a dot at the head', () => {
    const g = new Recorder();
    const trail = [
      { time: -0.2, midi: 60, onPitch: false },
      { time: -0.15, midi: 60.2, onPitch: false },
      { time: -0.1, midi: 60.1, onPitch: true },
      { time: -0.05, midi: 60, onPitch: true },
      { time: 0, midi: 60, onPitch: true },
    ];
    renderer.draw(asCanvas(g), SIZE, view({ trail }));
    const strokes = g.calls.filter(
      (c) => c.op === 'stroke' && (c.stroke === COLORS.trailOn || c.stroke === COLORS.trailOff),
    );
    expect(strokes.filter((c) => c.stroke === COLORS.trailOff).length).toBe(1);
    expect(strokes.filter((c) => c.stroke === COLORS.trailOn).length).toBe(3);
    expect(g.count('arc')).toBe(1); // head dot
    // each trail segment has a dark outline underneath so it shows over same-coloured bars
    expect(
      g.calls.filter((c) => c.op === 'stroke' && c.stroke === COLORS.trailOutline),
    ).toHaveLength(4);
  });

  it('breaks the trail at gaps and does not draw a head dot when nothing was sung recently', () => {
    const g = new Recorder();
    renderer.draw(
      asCanvas(g),
      SIZE,
      view({
        time: 2,
        trail: [
          { time: 0.1, midi: 60, onPitch: true },
          { time: 0.15, midi: null, onPitch: false },
          { time: 0.2, midi: 60, onPitch: true },
        ],
      }),
    );
    expect(g.calls.filter((c) => c.op === 'stroke' && c.stroke === COLORS.trailOn)).toHaveLength(0);
    expect(g.count('arc')).toBe(0);
  });

  it('draws the grid with note names in the gutter and the now line', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view());
    expect(g.texts()).toEqual(expect.arrayContaining(['C4', 'D4', 'E4', 'F4', 'G4']));
    const l = renderer.currentLayout(SIZE, chart.notes);
    const nowLine = g.calls.find(
      (c) => c.op === 'moveTo' && c.args[0] === l.nowX && c.args[1] === 0,
    );
    expect(nowLine).toBeDefined();
  });

  it('copes with an empty chart, no trail and notes without pitch', () => {
    const g = new Recorder();
    expect(() => renderer.draw(asCanvas(g), SIZE, view({ notes: [], statuses: [] }))).not.toThrow();
    expect(() =>
      renderer.draw(
        asCanvas(new Recorder()),
        SIZE,
        view({ notes: [{ t: 1, duration: 1 }], statuses: ['pending'] }),
      ),
    ).not.toThrow();
  });

  it('draws note labels after the trail so scribbles never cover them', () => {
    const g = new Recorder();
    renderer.draw(
      asCanvas(g),
      SIZE,
      view({
        time: 1.5,
        trail: [
          { time: 1.4, midi: 60, onPitch: true },
          { time: 1.45, midi: 60, onPitch: true },
        ],
      }),
    );
    const lastTrailStroke = g.calls
      .map((c) => c.op === 'stroke' && c.stroke === COLORS.trailOn)
      .lastIndexOf(true);
    const firstBarLabel = g.calls.findIndex((c) => c.op === 'fillText' && c.fill === COLORS.bg);
    expect(lastTrailStroke).toBeGreaterThan(-1);
    expect(firstBarLabel).toBeGreaterThan(lastTrailStroke);
  });

  it('balances save/restore so state does not leak between frames', () => {
    const g = new Recorder();
    renderer.draw(asCanvas(g), SIZE, view({ trail: [{ time: 0, midi: 60, onPitch: true }] }));
    expect(g.count('save')).toBe(g.count('restore'));
  });

  it('recomputes layout when the canvas resizes but caches otherwise', () => {
    const r = new PitchHighwayRenderer();
    const a = r.currentLayout(SIZE, chart.notes);
    expect(r.currentLayout(SIZE, chart.notes)).toBe(a);
    expect(r.currentLayout({ width: 400, height: 300 }, chart.notes)).not.toBe(a);
  });
});

describe('helpers', () => {
  it.each([
    [60, 'C4'],
    [61, 'C#4'],
    [69, 'A4'],
    [71, 'B4'],
    [72, 'C5'],
    [48, 'C3'],
  ])('midiName(%d) = %s', (m, name) => expect(midiName(m)).toBe(name));

  it('describePitch names a frequency with cents, or null', () => {
    expect(describePitch(440)).toEqual({ name: 'A4', cents: 0 });
    expect(describePitch(null)).toBeNull();
    expect(describePitch(0)).toBeNull();
  });

  it.each([
    [60, 60, 60],
    [72, 60, 60],
    [48, 60, 60],
    [65, 60, 65], // within half an octave: stays put
    [67, 60, 55], // G4 is 7 up from C4 but G3 is only 5 down
    [55, 60, 55],
    [43.4, 60, 55.4],
    [84.2, 60, 60.2],
  ])('foldMidiNear(%d, ref %d) = %d', (midi, ref, expected) => {
    expect(foldMidiNear(midi, ref)).toBeCloseTo(expected, 9);
  });

  it('PitchTrail keeps a rolling window', () => {
    const t = new PitchTrail(1);
    for (let i = 0; i <= 30; i++) t.push({ time: i * 0.1, midi: 60, onPitch: true });
    const times = t.snapshot.map((p) => p.time);
    expect(times[0]).toBeCloseTo(2, 9);
    expect(times.at(-1)).toBeCloseTo(3, 9);
    t.clear();
    expect(t.snapshot).toHaveLength(0);
  });

  it('createRenderer builds a renderer of every kind', () => {
    expect(createRenderer('pitch-highway').kind).toBe('pitch-highway');
    expect(createRenderer('percussion-lanes').kind).toBe('percussion-lanes');
    expect(createRenderer('lane-highway').kind).toBe('lane-highway');
  });

  it('roundedRect traces a closed path with four corners', () => {
    const g = new Recorder();
    roundedRect(asCanvas(g), 10, 10, 100, 20, 50);
    expect(g.count('arcTo')).toBe(4);
    expect(g.count('closePath')).toBe(1);
    // radius is clamped to half the height
    expect(g.calls.find((c) => c.op === 'arcTo')!.args[4]).toBe(10);
  });
});
