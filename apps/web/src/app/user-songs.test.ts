import type { KeyValueStore } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import {
  MAX_USER_SONGS,
  UserSongStore,
  compileSong,
  describeCompiled,
  packFromText,
  packToText,
  songFromText,
  songToText,
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

describe('UserSongStore ids', () => {
  it('never gives a new song the id of a saved one, even after a delete in the same millisecond', () => {
    const store = new UserSongStore(new Mem());
    const a = store.save({ ...melody(), id: undefined }, 5000)!;
    const b = store.save({ ...melody({ title: 'B' }), id: undefined }, 5000)!;
    store.delete(a.id);
    const c = store.save({ ...melody({ title: 'C' }), id: undefined }, 5000)!;
    expect(new Set([b.id, c.id]).size).toBe(2);
    expect(store.list().map((s) => s.title)).toEqual(['B', 'C']);
  });

  it('says a strum pattern is too long, in the preview, instead of failing at save', () => {
    const long = {
      id: 'my-x',
      title: 'Long',
      bpm: 90,
      kind: 'chords' as const,
      bars: 'C',
      pattern: 'D'.repeat(201),
      beatsPerBar: 4 as const,
    };
    const c = compileSong(long);
    expect(!c.ok && c.error).toMatch(/too long/);
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

describe('sharing songs as text', () => {
  const melody = {
    id: 'my-abc',
    kind: 'melody' as const,
    title: 'Shared',
    bpm: 90,
    key: 7,
    notes: 'G4 A4 B4:2',
    lyrics: 'la la laa',
  };

  it('round-trips every kind of song through text', () => {
    const songs: UserSong[] = [
      melody,
      {
        id: 'my-b',
        kind: 'chords',
        title: 'C',
        bpm: 80,
        bars: 'C | G',
        pattern: 'D . D U . U D U',
        beatsPerBar: 4,
      },
      {
        id: 'my-c',
        kind: 'rhythm',
        title: 'R',
        bpm: 80,
        profile: 'drum-kit',
        lanes: 'kick: x...x...\nsnare: ..x...x.',
        stepsPerBeat: 2,
      },
    ];
    for (const s of songs) {
      const back = songFromText(songToText(s));
      expect(back.ok).toBe(true);
      const rest: Record<string, unknown> = { ...s };
      delete rest['id'];
      if (back.ok) expect(back.song).toEqual(rest);
    }
    expect(songToText(melody)).not.toContain('my-abc');
  });

  it('reads ABC, and says what is wrong with anything else', () => {
    const abc = songFromText('T:Tune\nL:1/4\nK:G\nG A B2\nw:la la laa');
    expect(abc).toMatchObject({ ok: true, song: { kind: 'melody', title: 'Tune', key: 7 } });
    expect(songFromText('').ok).toBe(false);
    expect(songFromText('hello there')).toMatchObject({ ok: false });
    expect(songFromText('LINEUP-SONG-1 {oops')).toMatchObject({ ok: false });
    expect(songFromText('LINEUP-SONG-1 {"kind":"melody"}')).toMatchObject({ ok: false });
    expect(
      songFromText('LINEUP-SONG-1 {"kind":"melody","title":"x","bpm":90,"key":0,"notes":"H9"}'),
    ).toMatchObject({ ok: false });
  });

  it('keeps lyrics through storage and drops junk ones', () => {
    const mem = new Map<string, string>();
    const store = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const songs = new UserSongStore(store);
    const saved = songs.save({ ...melody, id: undefined })!;
    expect(new UserSongStore(store).get(saved.id)).toMatchObject({ lyrics: 'la la laa' });
    mem.set('lineup.songs.v1', JSON.stringify([{ ...saved, lyrics: 42 }]));
    // junk lyrics are dropped, the song stays
    expect(new UserSongStore(store).list()[0]!.kind === 'melody').toBe(true);
    expect('lyrics' in new UserSongStore(store).list()[0]!).toBe(false);
  });
});

describe('packs of songs as text', () => {
  const a = { id: 'my-a', kind: 'melody' as const, title: 'A', bpm: 90, key: 0, notes: 'C4 D4 E4' };
  const b = {
    id: 'my-b',
    kind: 'chords' as const,
    title: 'B',
    bpm: 80,
    bars: 'C | G',
    pattern: 'D . D U . U D U',
    beatsPerBar: 4 as const,
  };

  it('round-trips several songs without their ids', () => {
    const text = packToText([a, b]);
    expect(text).not.toContain('my-a');
    const back = packFromText(text);
    expect(back).toMatchObject({ ok: true, skipped: 0 });
    if (back.ok) expect(back.songs.map((s) => s.title)).toEqual(['A', 'B']);
  });

  it('skips songs that do not compile, and refuses anything that is not a pack', () => {
    const bad = packToText([a]).replace('C4 D4 E4', 'H9');
    expect(packFromText(bad)).toMatchObject({ ok: false });
    const mixed = `LINEUP-PACK-1 ${JSON.stringify([{ ...a, id: undefined }, { kind: 'melody', title: 'X', bpm: 90, key: 0, notes: 'H9' }, 7])}`;
    expect(packFromText(mixed)).toMatchObject({ ok: true, skipped: 2 });
    expect(packFromText('hello')).toMatchObject({ ok: false });
    expect(packFromText('LINEUP-PACK-1 {nope')).toMatchObject({ ok: false });
    expect(packFromText('LINEUP-PACK-1 {"a":1}')).toMatchObject({ ok: false });
  });

  it('takes at most the limit of songs', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ ...a, id: `my-${i}`, title: `S${i}` }));
    const back = packFromText(packToText(many));
    expect(back.ok && back.songs.length).toBe(50);
  });
});
