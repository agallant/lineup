import { chartFromBeats, getProfile, getSong, type NoteStatus } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  ANY_LANE,
  FLASH_SECONDS,
  PercussionLanesRenderer,
  computeLaneLayout,
  flashProgress,
  hitTimeToX,
  laneCenterY,
} from './percussion-lanes';
import { createRenderer } from './pitch-highway';
import { COLORS, type Canvas2D, type HitFlash, type RenderView } from './renderer';

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
  /** Discs (arcs followed by a fill) with the colour they were filled with. */
  discs() {
    const out: { x: number; y: number; r: number; fill: string; alpha: number }[] = [];
    this.calls.forEach((c, i) => {
      if (c.op !== 'arc') return;
      const next = this.calls[i + 1];
      if (next?.op === 'fill')
        out.push({
          x: c.args[0] as number,
          y: c.args[1] as number,
          r: c.args[2] as number,
          fill: next.fill,
          alpha: next.alpha,
        });
    });
    return out;
  }
  rings() {
    const out: { x: number; y: number; stroke: string }[] = [];
    this.calls.forEach((c, i) => {
      if (c.op !== 'arc') return;
      const next = this.calls[i + 1];
      if (next?.op === 'stroke')
        out.push({ x: c.args[0] as number, y: c.args[1] as number, stroke: next.stroke });
    });
    return out;
  }
  texts(): string[] {
    return this.calls.filter((c) => c.op === 'fillText').map((c) => String(c.args[0]));
  }
}
const asCanvas = (r: Recorder) => r as unknown as Canvas2D;

const profile = getProfile('hand-percussion');
const chart = chartFromBeats({ title: 't', bpm: 120 }, [
  { beat: 0, lane: 'clap' },
  { beat: 1, lane: 'tap' },
  { beat: 2, lane: 'clap' },
]);
const SIZE = { width: 800, height: 300 };

const view = (over: Partial<RenderView> = {}): RenderView => ({
  time: 0,
  notes: chart.notes,
  statuses: chart.notes.map((): NoteStatus => 'pending'),
  profile,
  ...over,
});

describe('computeLaneLayout', () => {
  it('splits the height evenly, puts "now" in the plot and scrolls lookAhead seconds across', () => {
    const l = computeLaneLayout(SIZE, 2, { lookAhead: 4, nowFraction: 0.25, gutter: 60 });
    expect(l.laneHeight).toBeCloseTo((300 - 12) / 2);
    expect(l.nowX).toBeCloseTo(60 + 740 * 0.25);
    expect(hitTimeToX(l, 4, 0)).toBeCloseTo(800); // lookAhead seconds ahead is the right edge
    expect(hitTimeToX(l, 0, 0)).toBe(l.nowX);
    expect(hitTimeToX(l, -1, 0)).toBeLessThan(l.nowX);
  });

  it('lanes are stacked top to bottom and the note radius fits the lane', () => {
    const l = computeLaneLayout(SIZE, 3);
    expect(laneCenterY(l, 0)).toBeLessThan(laneCenterY(l, 1));
    expect(laneCenterY(l, 1) - laneCenterY(l, 0)).toBeCloseTo(l.laneHeight);
    expect(l.radius * 2).toBeLessThan(l.laneHeight);
    expect(computeLaneLayout({ width: 300, height: 40 }, 3).radius).toBeGreaterThanOrEqual(6);
  });

  it('survives zero lanes and tiny canvases', () => {
    expect(computeLaneLayout({ width: 10, height: 2 }, 0).laneHeight).toBeGreaterThan(0);
  });
});

describe('flashProgress', () => {
  const f: HitFlash = { time: 1, lane: 'clap', velocity: 1 };
  it('runs 0..1 over the flash and is null before and after', () => {
    expect(flashProgress(f, 1)).toBe(0);
    expect(flashProgress(f, 1 + FLASH_SECONDS / 2)).toBeCloseTo(0.5);
    expect(flashProgress(f, 1 + FLASH_SECONDS)).toBeCloseTo(1);
    expect(flashProgress(f, 1 + FLASH_SECONDS + 0.01)).toBeNull();
    expect(flashProgress(f, 0.99)).toBeNull();
  });
});

describe('PercussionLanesRenderer', () => {
  const draw = (v: RenderView) => {
    const r = new Recorder();
    new PercussionLanesRenderer().draw(asCanvas(r), SIZE, v);
    return r;
  };

  it('labels each lane in its own colour', () => {
    const r = draw(view());
    expect(r.texts()).toEqual(['Clap', 'Tap']);
    expect(r.calls.filter((c) => c.op === 'fillText').map((c) => c.fill)).toEqual(
      profile.lanes!.map((l) => l.color),
    );
  });

  it('draws one disc per visible note, in its lane (row) and lane colour', () => {
    const r = draw(view());
    const discs = r.discs();
    expect(discs).toHaveLength(3);
    const l = computeLaneLayout(SIZE, 2);
    expect(discs.map((d) => d.y)).toEqual([
      laneCenterY(l, 0),
      laneCenterY(l, 1),
      laneCenterY(l, 0),
    ]);
    expect(discs.map((d) => d.fill)).toEqual(['#ffd166', '#4cc9f0', '#ffd166']);
    expect(discs[0]!.x).toBeCloseTo(l.nowX);
    expect(discs[1]!.x).toBeGreaterThan(discs[0]!.x);
  });

  it('skips notes that scrolled off either side or belong to no lane', () => {
    expect(draw(view({ time: 10 })).discs()).toHaveLength(0);
    expect(draw(view({ time: -20 })).discs()).toHaveLength(0);
    const odd = chartFromBeats({ title: 't', bpm: 120 }, [{ beat: 0, lane: 'cowbell' }]);
    expect(draw(view({ notes: odd.notes, statuses: ['pending'] })).discs()).toHaveLength(0);
  });

  it('rings judged notes green / yellow / red and dims them', () => {
    const r = draw(view({ statuses: ['perfect', 'good', 'miss'] }));
    expect(r.rings().map((x) => x.stroke)).toEqual([COLORS.perfect, COLORS.good, COLORS.miss]);
    const alphas = r.discs().map((d) => d.alpha);
    expect(alphas[2]).toBeLessThan(alphas[0]!); // missed is dimmer than perfect
    expect(Math.max(...alphas)).toBeLessThan(1);
    expect(draw(view()).rings()).toHaveLength(0);
  });

  it('flashes a hit on the now line in the lane it was classified into', () => {
    const l = computeLaneLayout(SIZE, 2);
    const r = draw(
      view({
        time: 0.05,
        hits: [{ time: 0, lane: 'tap', velocity: 0.9 }],
        notes: [],
        statuses: [],
      }),
    );
    const flash = r.discs();
    expect(flash).toHaveLength(1);
    expect(flash[0]).toMatchObject({ x: l.nowX, y: laneCenterY(l, 1), fill: '#4cc9f0' });
    expect(flash[0]!.r).toBeGreaterThan(l.radius);
  });

  it('fades flashes out and stops drawing them after FLASH_SECONDS', () => {
    const hit = { time: 0, lane: 'clap', velocity: 1 };
    const early = draw(view({ time: 0.01, hits: [hit], notes: [], statuses: [] })).discs()[0]!
      .alpha;
    const late = draw(
      view({ time: FLASH_SECONDS * 0.9, hits: [hit], notes: [], statuses: [] }),
    ).discs()[0]!.alpha;
    expect(late).toBeLessThan(early);
    expect(
      draw(view({ time: FLASH_SECONDS + 0.1, hits: [hit], notes: [], statuses: [] })).discs(),
    ).toHaveLength(0);
  });

  it('louder hits flash brighter', () => {
    const at = (velocity: number) =>
      draw(
        view({ time: 0.05, hits: [{ time: 0, lane: 'clap', velocity }], notes: [], statuses: [] }),
      ).discs()[0]!.alpha;
    expect(at(1)).toBeGreaterThan(at(0.2));
  });

  it('shows a rejected sound (no lane) as a grey bar across all lanes, not in a lane', () => {
    const r = draw(
      view({ time: 0.05, hits: [{ time: 0, lane: '', velocity: 1 }], notes: [], statuses: [] }),
    );
    expect(r.discs()).toHaveLength(0);
    const bar = r.calls.filter((c) => c.op === 'fillRect' && c.fill === COLORS.muted);
    expect(bar).toHaveLength(1);
    expect(bar[0]!.args[3]).toBe(SIZE.height);
  });

  it('flashes an any-lane hit (a strum) as a bright bar over the whole now line', () => {
    const r = draw(
      view({
        time: 0.05,
        hits: [{ time: 0, lane: ANY_LANE, velocity: 1 }],
        notes: [],
        statuses: [],
      }),
    );
    expect(r.discs()).toHaveLength(0);
    const bar = r.calls.filter((c) => c.op === 'fillRect' && c.fill === COLORS.active);
    expect(bar).toHaveLength(1);
    expect(bar[0]!.args[3]).toBe(SIZE.height);
  });

  it('writes the chord on strum notes, and nothing on other notes', () => {
    const strum = getProfile('ukulele-strum');
    const chart = getSong('strum-four-chords');
    const r = draw(
      view({
        profile: strum,
        notes: chart.notes.slice(0, 3),
        statuses: ['pending', 'pending', 'pending'],
        time: 0,
      }),
    );
    expect(r.texts().filter((t) => t === 'C')).toHaveLength(3);
    expect(r.texts()).toContain('Down');
    expect(draw(view()).texts()).toEqual(['Clap', 'Tap']);
  });

  it('single-lane profiles (any hit) draw one lane', () => {
    const clapChart = chartFromBeats({ title: 't', bpm: 120 }, [{ beat: 0, lane: 'hit' }]);
    const r = draw(
      view({ profile: getProfile('clap'), notes: clapChart.notes, statuses: ['pending'] }),
    );
    expect(r.texts()).toEqual(['Clap']);
    expect(r.discs()).toHaveLength(1);
  });

  it('createRenderer builds it from the profile', () => {
    expect(createRenderer(profile.renderer)).toBeInstanceOf(PercussionLanesRenderer);
  });
});
