import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  MAX_USER_SONGS,
  UserSongStore,
  compileSong,
  describeCompiled,
  userSongsFor,
  type UserSong,
} from './user-songs';

class Mem implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const melody = (patch: Partial<Extract<UserSong, { kind: 'melody' }>> = {}) => ({
  id: 'my-test',
  title: 'My tune',
  bpm: 100,
  kind: 'melody' as const,
  key: 0,
  notes: 'C4 D4 E4 F4 | G4:2 E4 C4:2',
  ...patch,
});

describe('compileSong', () => {
  it('turns a melody into a voice chart, and a wind chart an octave up when no note is below the key', () => {
    const c = compileSong(melody());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.charts.map((x) => x.profileId)).toEqual(['voice', 'wind']);
    const [voice, wind] = c.charts;
    expect(voice!.chart.meta).toMatchObject({ title: 'My tune', bpm: 100, tonic: 60 });
    expect(wind!.chart.meta.tonic).toBe(72);
    expect(wind!.chart.notes[0]!.pitch).toBe(voice!.chart.notes[0]!.pitch! + 12);
    expect(describeCompiled(c)).toMatch(
      /^7 notes · \d+ s · difficulty \d+\/10 \(diatonic\) · for voice and wind$/,
    );
  });

  it('keeps a melody that dips below its key to the voice', () => {
    const c = compileSong(melody({ notes: 'G3 C4 E4 C4' }));
    expect(c.ok && c.charts.map((x) => x.profileId)).toEqual(['voice']);
  });

  it('makes chord songs and rhythms, and says what is wrong in words', () => {
    const chords = compileSong({
      id: 'my-c',
      title: 'Chords',
      bpm: 90,
      kind: 'chords',
      bars: 'C | Am | F | G',
      pattern: 'D . D U . U D U',
      beatsPerBar: 4,
    });
    expect(chords.ok && chords.charts[0]!.profileId).toBe('ukulele-strum');
    const rhythm = compileSong({
      id: 'my-r',
      title: 'Beat',
      bpm: 80,
      kind: 'rhythm',
      profile: 'drum-kit',
      lanes: 'kick: x...x...\nsnare: ..x...x.',
      stepsPerBeat: 2,
    });
    expect(rhythm.ok && rhythm.charts[0]!.chart.notes).toHaveLength(4);
    const bad = (song: UserSong) => {
      const r = compileSong(song);
      return r.ok ? '' : r.error;
    };
    expect(bad(melody({ title: ' ' }))).toMatch(/title/);
    expect(bad(melody({ bpm: 500 }))).toMatch(/tempo/);
    expect(bad(melody({ notes: 'C4 H9' }))).toMatch(/H9/);
    expect(bad(melody({ notes: 'C0 C1' }))).toMatch(/between C2 and C7/);
    expect(
      bad({
        ...melody(),
        kind: 'chords',
        bars: 'C | Xm',
        pattern: 'D . D . D . D .',
        beatsPerBar: 4,
      } as UserSong),
    ).toMatch(/Xm/);
    expect(
      bad({ ...melody(), kind: 'chords', bars: 'C', pattern: 'D D', beatsPerBar: 4 } as UserSong),
    ).toMatch(/steps/);
    expect(
      bad({
        id: 'my-r',
        title: 'x',
        bpm: 80,
        kind: 'rhythm',
        profile: 'clap',
        lanes: 'kick: x...',
        stepsPerBeat: 2,
      }),
    ).toMatch(/lanes hit/);
    expect(
      bad({
        id: 'my-r',
        title: 'x',
        bpm: 80,
        kind: 'rhythm',
        profile: 'clap',
        lanes: 'nonsense',
        stepsPerBeat: 2,
      }),
    ).toMatch(/kick: x/);
  });
});

describe('UserSongStore', () => {
  it('saves, edits, lists and deletes songs, and keeps them across loads', () => {
    const mem = new Mem();
    const store = new UserSongStore(mem);
    const a = store.save({ ...melody(), id: undefined }, 1000)!;
    expect(a.id).toMatch(/^my-[a-z0-9]+$/);
    const b = store.save({ ...melody({ title: 'Second' }), id: undefined }, 2000)!;
    expect(b.id).not.toBe(a.id);
    store.save({ ...a, title: 'Renamed' });
    expect(new UserSongStore(mem).list().map((s) => s.title)).toEqual(['Renamed', 'Second']);
    expect(store.get(a.id)?.title).toBe('Renamed');
    store.delete(a.id);
    expect(new UserSongStore(mem).list().map((s) => s.title)).toEqual(['Second']);
  });

  it('refuses text that is not a song, and too many songs', () => {
    const store = new UserSongStore(new Mem());
    expect(store.save({ ...melody({ notes: 'nonsense' }), id: undefined })).toBeNull();
    for (let i = 0; i < MAX_USER_SONGS; i++) store.save({ ...melody(), id: undefined }, i);
    expect(store.list()).toHaveLength(MAX_USER_SONGS);
    expect(store.save({ ...melody(), id: undefined }, 99999)).toBeNull();
  });

  it('survives bad storage and works in memory when storage is blocked', () => {
    const mem = new Mem();
    mem.setItem(
      'lineup.songs.v1',
      '[{"id":"my-a","title":"ok","bpm":90,"kind":"melody","key":0,"notes":"C4 D4"},{"id":"evil","title":"x"},5]',
    );
    expect(new UserSongStore(mem).list().map((s) => s.id)).toEqual(['my-a']);
    mem.setItem('lineup.songs.v1', 'not json');
    expect(new UserSongStore(mem).list()).toEqual([]);
    const blocked = new UserSongStore(null);
    expect(blocked.save({ ...melody(), id: undefined })).not.toBeNull();
    expect(blocked.list()).toHaveLength(1);
  });
});

describe('userSongsFor', () => {
  it('offers each song to the instruments it suits', () => {
    const store = new UserSongStore(new Mem());
    store.save({ ...melody(), id: undefined }, 1);
    store.save({ ...melody({ title: 'Low', notes: 'G3 C4 E4' }), id: undefined }, 2);
    store.save(
      {
        id: undefined,
        title: 'Strum',
        bpm: 90,
        kind: 'chords',
        bars: 'C | G',
        pattern: 'D . D . D . D .',
        beatsPerBar: 4,
      },
      3,
    );
    expect(userSongsFor('voice', store).map((s) => s.chart.meta.title)).toEqual(['My tune', 'Low']);
    expect(userSongsFor('wind', store).map((s) => s.chart.meta.title)).toEqual(['My tune']);
    expect(userSongsFor('ukulele-strum', store).map((s) => s.chart.meta.title)).toEqual(['Strum']);
    expect(userSongsFor('clap', store)).toEqual([]);
  });
});
