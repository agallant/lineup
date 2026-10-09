import { describe, expect, it } from 'vitest';
import { chartPitchRange } from '../chart';
import { getProfile } from '../profiles';
import { getSong, songsFor } from './index';

describe('built-in songs', () => {
  it('getSong returns a known song', () => {
    expect(getSong('ukulele-strum-demo').meta.title).toMatch(/Island/);
  });

  it('getSong explains an unknown id and lists the known ones', () => {
    expect(() => getSong('nope')).toThrow(/unknown song "nope" \(have: ukulele-strum-demo/);
  });

  it('has wind songs that fit the whistle/recorder/ocarina range', () => {
    const wind = getProfile('wind');
    const songs = songsFor('wind');
    expect(songs.map((s) => s.id)).toEqual(['wind-scale', 'wind-twinkle', 'wind-ode']);
    for (const { id, chart } of songs) {
      const r = chartPitchRange(chart)!;
      expect(r.low, id).toBeGreaterThanOrEqual(wind.range!.lowMidi);
      expect(r.high, id).toBeLessThanOrEqual(wind.range!.highMidi);
      // notes are separated (a player has to re-tongue repeated notes)
      for (let i = 1; i < chart.notes.length; i++) {
        const prev = chart.notes[i - 1]!;
        expect(chart.notes[i]!.t, `${id} #${i}`).toBeGreaterThan(prev.t + prev.duration);
      }
    }
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])(
    'treats inherited Object.prototype names like "%s" as unknown ids',
    (id) => {
      expect(() => getSong(id)).toThrow(/unknown song/);
    },
  );
});
