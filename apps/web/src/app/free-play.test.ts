import { describe, expect, it } from 'vitest';
import {
  clampBpm,
  clicksBetween,
  clock,
  extensionFor,
  pickRecordingType,
  RECORDING_TYPES,
} from './free-play';

describe('free play', () => {
  it('clicks once a beat with the first of each bar accented', () => {
    const clicks = clicksBetween(10, 120, 3, 10, 13);
    expect(clicks.map((c) => c.time)).toEqual([10, 10.5, 11, 11.5, 12, 12.5]);
    expect(clicks.map((c) => c.accent)).toEqual([true, false, false, true, false, false]);
  });

  it('gives each click once across back-to-back look-ahead windows', () => {
    const all = clicksBetween(0, 100, 4, 0, 30);
    const pieces = [0, 0.7, 1.9, 5.3, 12, 30].flatMap((from, i, a) =>
      i + 1 < a.length ? clicksBetween(0, 100, 4, from, a[i + 1]!) : [],
    );
    expect(pieces.map((c) => c.time)).toEqual(all.map((c) => c.time));
    expect(pieces.map((c) => c.accent)).toEqual(all.map((c) => c.accent));
  });

  it('never clicks before it began, and an empty window has no clicks', () => {
    expect(clicksBetween(5, 60, 4, 0, 4)).toEqual([]);
    expect(clicksBetween(5, 60, 4, 5, 5)).toEqual([]);
    expect(clicksBetween(5, 60, 4, 4, 6.5).map((c) => c.time)).toEqual([5, 6]);
  });

  it('keeps the tempo in range', () => {
    expect(clampBpm(100.4)).toBe(100);
    expect(clampBpm(5)).toBe(30);
    expect(clampBpm(999)).toBe(240);
    expect(clampBpm(Number.NaN)).toBe(100);
    expect(clampBpm(Number.NaN, 80)).toBe(80);
  });

  it('chooses a recording type the browser supports, and names the file', () => {
    expect(pickRecordingType(() => true)).toBe(RECORDING_TYPES[0]);
    expect(pickRecordingType((t) => t === 'audio/webm')).toBe('audio/webm');
    expect(pickRecordingType(() => false)).toBe('');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionFor('')).toBe('webm');
  });

  it('writes a time as minutes and seconds', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65.9)).toBe('1:05');
    expect(clock(-3)).toBe('0:00');
  });
});
