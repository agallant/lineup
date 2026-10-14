import { KEY_PIECES, SongClock, getProfile, type TimeSource } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { KeylineGame } from './keyline-game';

const profile = getProfile('keyboard');

/** Plays a chart through a fake clock, pressing each note `shift` seconds late (and `wrong` semitones off). */
function play(id: string, { shift = 0, wrong = 0 } = {}) {
  const chart = KEY_PIECES[id]!;
  const src = { currentTime: 0 } satisfies TimeSource as { currentTime: number };
  const clock = new SongClock(src);
  clock.start(0, 0);
  const game = new KeylineGame({ chart, profile, clock, latencyOffset: 0 });
  const end = Math.max(...chart.notes.map((n) => n.t + n.duration)) + 1;
  const queue = chart.notes
    .map((n) => ({ at: n.t + shift, midi: (n.pitch ?? 60) + wrong }))
    .sort((a, b) => a.at - b.at);
  for (let t = 0; t <= end; t += 0.01) {
    src.currentTime = t;
    while (queue.length && queue[0]!.at <= t) {
      const p = queue.shift()!;
      game.press(p.midi, p.at);
      game.release(p.midi);
    }
    game.update();
  }
  game.finish();
  return game;
}

describe('KeylineGame', () => {
  const id = Object.keys(KEY_PIECES)[0]!;

  it('a player pressing every key on time scores perfectly', () => {
    const g = play(id);
    expect(g.session.score.accuracy).toBeGreaterThan(0.95);
    expect(g.session.score.counts.miss).toBe(0);
    expect(g.strays).toBe(0);
  });

  it('every piece can be played through, chords note by note', () => {
    for (const piece of Object.keys(KEY_PIECES)) {
      expect(play(piece).session.score.accuracy, piece).toBeGreaterThan(0.9);
    }
  });

  it('the wrong keys score nothing', () => {
    const g = play(id, { wrong: 1 });
    expect(g.session.score.counts.perfect + g.session.score.counts.good).toBe(0);
    expect(g.strays).toBeGreaterThan(0);
  });

  it('keys pressed late miss', () => {
    const g = play(id, { shift: 0.5 });
    expect(g.session.score.counts.miss).toBeGreaterThan(0);
  });

  it('tracks held keys for drawing', () => {
    const chart = KEY_PIECES[id]!;
    const clock = new SongClock({ currentTime: 0 });
    const g = new KeylineGame({ chart, profile, clock, latencyOffset: 0 });
    g.press(60, 0);
    g.press(64, 0);
    expect(g.view().pressed).toEqual([60, 64]);
    g.release(60);
    expect(g.view().pressed).toEqual([64]);
    g.releaseAll();
    expect(g.view().pressed).toEqual([]);
  });
});
