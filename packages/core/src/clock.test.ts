import { describe, expect, it } from 'vitest';
import { SongClock, type TimeSource } from './clock';

class FakeSource implements TimeSource {
  currentTime = 0;
}

describe('SongClock', () => {
  it('tracks the source clock, not wall time or frames', () => {
    const src = new FakeSource();
    const clock = new SongClock(src);
    src.currentTime = 10;
    clock.start();
    expect(clock.now()).toBe(0);
    src.currentTime = 12.5;
    expect(clock.now()).toBe(2.5);
    src.currentTime = 12.5000001;
    expect(clock.now()).toBeCloseTo(2.5000001, 9);
  });

  it('supports a count-in (negative song time at start)', () => {
    const src = new FakeSource();
    const clock = new SongClock(src);
    src.currentTime = 5;
    clock.start(-2);
    expect(clock.now()).toBe(-2);
    src.currentTime = 7;
    expect(clock.now()).toBe(0);
  });

  it('can start at a scheduled future source time', () => {
    const src = new FakeSource();
    const clock = new SongClock(src);
    src.currentTime = 1;
    clock.start(0, 1.25); // audio scheduled to begin at 1.25
    expect(clock.now()).toBeCloseTo(-0.25, 12);
    src.currentTime = 2.25;
    expect(clock.now()).toBe(1);
  });

  it('converts both ways', () => {
    const src = new FakeSource();
    const clock = new SongClock(src);
    clock.start(-4, 100);
    expect(clock.toSongTime(103)).toBe(-1);
    expect(clock.toSourceTime(-1)).toBe(103);
    expect(clock.toSourceTime(clock.toSongTime(123.456))).toBeCloseTo(123.456, 12);
  });

  it('reports not running before start and after stop', () => {
    const src = new FakeSource();
    const clock = new SongClock(src);
    expect(clock.running).toBe(false);
    expect(() => clock.toSourceTime(0)).toThrow(/not running/);
    clock.start();
    expect(clock.running).toBe(true);
    clock.stop();
    expect(clock.running).toBe(false);
  });
});
