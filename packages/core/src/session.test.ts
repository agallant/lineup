import { describe, expect, it } from 'vitest';
import { chartFromBeats } from './chart';
import { SongClock, type TimeSource } from './clock';
import { DiscreteJudge } from './judge/discrete';
import { GameSession } from './session';
import { songsFor } from './songs';

class Time implements TimeSource {
  currentTime = 0;
}

const chart = chartFromBeats({ title: 't', bpm: 60 }, [{ beat: 1 }, { beat: 2 }, { beat: 3 }]);

function make() {
  const time = new Time();
  const clock = new SongClock(time);
  time.currentTime = 10;
  clock.start(-1); // song time 0 at ctx 11
  const judge = new DiscreteJudge(chart.notes, {
    perfectWindow: 0.05,
    goodWindow: 0.1,
    settle: 0.05,
  });
  return { time, clock, session: new GameSession(chart, judge, clock) };
}

describe('GameSession', () => {
  it('scores hits as they are judged and tracks per-note status', () => {
    const { time, session } = make();
    expect(session.statuses).toEqual(['pending', 'pending', 'pending']);
    session.feed({ time: 1.01, kind: 'onset' }); // note 0, perfect
    time.currentTime = 11 + 1.1;
    const first = session.update();
    expect(first.map((j) => j.grade)).toEqual(['perfect']);
    expect(session.statuses).toEqual(['perfect', 'pending', 'pending']);
    expect(session.score.counts.perfect).toBe(1);
  });

  it('expires untouched notes as the clock passes them', () => {
    const { time, session } = make();
    time.currentTime = 11 + 2.5; // song time 2.5: note at 1 and 2 are past their windows
    const out = session.update();
    expect(out.map((j) => [j.noteIndex, j.grade])).toEqual([
      [0, 'miss'],
      [1, 'miss'],
    ]);
    expect(session.statuses).toEqual(['miss', 'miss', 'pending']);
    expect(session.score.combo).toBe(0);
  });

  it('finish resolves everything and marks the session finished', () => {
    const { session } = make();
    expect(session.finished).toBe(false);
    const out = session.finish();
    expect(out).toHaveLength(3);
    expect(session.finished).toBe(true);
    expect(session.statuses).toEqual(['miss', 'miss', 'miss']);
  });

  it('reports when the song is over', () => {
    const { session } = make();
    expect(session.endTime()).toBeCloseTo(3.8, 9);
    expect(session.endTime(0)).toBe(3);
  });
});

describe('songsFor', () => {
  it('lists the songs written for a profile', () => {
    expect(
      songsFor('voice')
        .map((s) => s.id)
        .sort(),
    ).toEqual(['singline-demo', 'singline-scale']);
    expect(songsFor('ukulele-strum').map((s) => s.id)).toEqual([
      'ukulele-strum-demo',
      'strum-four-chords',
      'strum-folk',
      'strum-picking',
    ]);
    expect(songsFor('kazoo')).toEqual([]);
  });
});
