import { describe, expect, it } from 'vitest';
import { classifyEvent } from './classify-event';
import { getProfile } from './profiles';
import { laneForClass, trainTimbreModel } from './timbre';

const feat = (centroid: number, low: number, high: number, decayMs: number) => ({
  centroid,
  low,
  mid: 1 - low - high,
  high,
  decayMs,
  zcr: 0.1 + high / 4,
  flatness: 0.2,
  peakDb: -10,
  rmsDb: -18,
});
const model = trainTimbreModel([
  ...[0, 1, 2, 3].map((i) => ({ classId: 'clap', features: feat(2400 + i * 20, 0.05, 0.45, 25) })),
  ...[0, 1, 2, 3].map((i) => ({ classId: 'tap', features: feat(350 + i * 5, 0.55, 0.05, 12) })),
]);

describe('classifyEvent', () => {
  const hand = getProfile('hand-percussion');
  const at = (features: ReturnType<typeof feat>, extra = {}) => ({
    time: 1,
    kind: 'onset' as const,
    features,
    ...extra,
  });

  it('sets the lane of the recognised class', () => {
    expect(classifyEvent(hand, model, at(feat(2410, 0.05, 0.45, 25))).event.lane).toBe('clap');
    expect(classifyEvent(hand, model, at(feat(352, 0.55, 0.05, 12))).event.lane).toBe('tap');
  });

  it('leaves no lane for an unknown sound, even if the event arrived with one', () => {
    const odd = at(feat(60, 0.99, 0.0, 400), { lane: 'clap' });
    const r = classifyEvent(hand, model, odd);
    expect(r.event.lane).toBeUndefined();
    expect(r.classification!.id).toBeNull();
  });

  it('passes events through untouched without a model, without features, or for non-percussion profiles', () => {
    const e = at(feat(2410, 0.05, 0.45, 25), { lane: 'x' });
    expect(classifyEvent(hand, null, e)).toEqual({ event: e, classification: null });
    const noFeatures = { time: 1, kind: 'onset' as const, lane: 'x' };
    expect(classifyEvent(hand, model, noFeatures).event).toBe(noFeatures);
    expect(classifyEvent(getProfile('ukulele-strum'), model, e).event).toBe(e);
  });
});

describe('laneForClass', () => {
  it('maps a class through lane.timbre', () => {
    const lanes = [
      { id: 'l1', timbre: 'clap' },
      { id: 'l2', timbre: 'tap' },
    ];
    expect(laneForClass(lanes, 'tap')).toBe('l2');
    expect(laneForClass(lanes, 'boom')).toBeUndefined();
    expect(laneForClass(lanes, null)).toBeUndefined();
    expect(laneForClass(undefined, 'tap')).toBeUndefined();
  });
  it('a single lane takes whatever class was recognised (any-hit)', () => {
    expect(laneForClass([{ id: 'hit' }], 'whatever')).toBe('hit');
    expect(laneForClass([{ id: 'hit' }], null)).toBeUndefined();
  });
});
