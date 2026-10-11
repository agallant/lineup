import {
  getProfile,
  grooveChart,
  melodyChart,
  melodyNotes,
  rateChart,
  strumChart,
  type Chart,
  type KeyValueStore,
} from '@lineup/core';

/** The longest text a song may be made from, and the most songs kept: storage must not grow without bound. */
export const MAX_SONG_TEXT = 4000;
export const MAX_USER_SONGS = 100;
const MAX_NOTES = 400;

export type PercussionProfile = 'clap' | 'hand-percussion' | 'drum-kit';
export const PERCUSSION_PROFILES: readonly PercussionProfile[] = [
  'clap',
  'hand-percussion',
  'drum-kit',
];

/** A song a player wrote, as the text they typed. */
export type UserSong = { id: string; title: string; bpm: number } & (
  | {
      kind: 'melody';
      /** The key note as a pitch class (0 = C ... 11 = B); the key is major. */
      key: number;
      /** Notes in the melody notation: "C4 D4 E4:2 r:1". */
      notes: string;
    }
  | {
      kind: 'chords';
      /** Chords, one per bar: "C | Am | F | G". */
      bars: string;
      /** One bar of strokes on eighth notes: "D . D U . U D U". */
      pattern: string;
      beatsPerBar: 3 | 4;
    }
  | {
      kind: 'rhythm';
      profile: PercussionProfile;
      /** One line per lane: "kick: x...x...". */
      lanes: string;
      stepsPerBeat: 2 | 3;
    }
);

/** Omit that keeps each case of a union apart. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A song to save: with no id it is new. */
export type NewUserSong = DistributiveOmit<UserSong, 'id'> & { id?: string | undefined };

/** A song's charts, one for each instrument profile it suits. */
export type Compiled =
  { ok: true; charts: { profileId: string; chart: Chart }[] } | { ok: false; error: string };

/** Turns what a player typed into charts, or says what is wrong in words. */
export function compileSong(song: UserSong): Compiled {
  try {
    const title = song.title.trim();
    if (title === '') return { ok: false, error: 'Give the song a title.' };
    if (!(song.bpm >= 30 && song.bpm <= 240)) {
      return { ok: false, error: 'The tempo should be between 30 and 240 beats a minute.' };
    }
    const meta = { title: title.slice(0, 80), artist: 'My songs', bpm: song.bpm };
    if (song.kind === 'melody') {
      if (song.notes.length > MAX_SONG_TEXT)
        return { ok: false, error: 'That melody is too long.' };
      const parsed = melodyNotes(song.notes);
      if (parsed.length > MAX_NOTES) return { ok: false, error: `At most ${MAX_NOTES} notes.` };
      const low = Math.min(...parsed.map((n) => n.pitch!));
      const high = Math.max(...parsed.map((n) => n.pitch!));
      if (low < 36 || high > 96) {
        return { ok: false, error: 'Notes should be between C2 and C7.' };
      }
      const tonic = 60 + song.key;
      const charts = [
        {
          profileId: 'voice',
          chart: melodyChart({ ...meta, instruments: ['voice'], tonic }, song.notes),
        },
      ];
      // a whistle or recorder cannot play below its key note: offer it only when no note does
      if (low >= tonic) {
        charts.push({
          profileId: 'wind',
          chart: melodyChart({ ...meta, instruments: ['wind'], tonic: tonic + 12 }, song.notes, 12),
        });
      }
      return { ok: true, charts };
    }
    if (song.kind === 'chords') {
      if (song.bars.length > MAX_SONG_TEXT) return { ok: false, error: 'That is too many bars.' };
      if (song.bars.split(/\s+/).filter((t) => t !== '' && t !== '|').length === 0) {
        return { ok: false, error: 'Write at least one chord.' };
      }
      const chart = strumChart(
        { ...meta, instruments: ['ukulele-strum'] },
        song.bars,
        song.pattern,
        { beatsPerBar: song.beatsPerBar },
      );
      return { ok: true, charts: [{ profileId: 'ukulele-strum', chart }] };
    }
    // rhythm: "lane: pattern" lines
    if (song.lanes.length > MAX_SONG_TEXT) return { ok: false, error: 'That rhythm is too long.' };
    const allowed = new Set((getProfile(song.profile).lanes ?? []).map((l) => l.id));
    const lanes: Record<string, string> = {};
    for (const line of song.lanes.split('\n')) {
      if (line.trim() === '') continue;
      const m = /^\s*([a-z]+)\s*:\s*(.+)$/.exec(line);
      if (!m)
        return { ok: false, error: `Write each line like "kick: x...x...", not "${line.trim()}".` };
      if (!allowed.has(m[1]!)) {
        return {
          ok: false,
          error: `${song.profile} has the lanes ${[...allowed].join(', ')}, not "${m[1]}".`,
        };
      }
      lanes[m[1]!] = m[2]!;
    }
    if (Object.keys(lanes).length === 0) return { ok: false, error: 'Write at least one line.' };
    const chart = grooveChart({ ...meta, instruments: [song.profile] }, lanes, song.stepsPerBeat);
    return { ok: true, charts: [{ profileId: song.profile, chart }] };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A one-line summary of a compiled song for the maker: notes, length and difficulty. */
export function describeCompiled(c: Compiled): string {
  if (!c.ok) return c.error;
  const chart = c.charts[0]!.chart;
  const end = chart.notes.at(-1)!.t;
  const r = rateChart(chart);
  const instruments = c.charts.map((x) => x.profileId).join(' and ');
  return `${chart.notes.length} notes · ${Math.round(end)} s · difficulty ${r.score}/10${
    r.scale ? ` (${r.scale})` : ''
  } · for ${instruments}`;
}

const KEY = 'lineup.songs.v1';

const clampText = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.length <= max ? v : null;

/** One song read back from storage, or null if it is not a usable one. */
function sanitize(raw: unknown): UserSong | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r['id'] === 'string' && /^my-[a-z0-9]{1,16}$/.test(r['id']) ? r['id'] : null;
  const title = clampText(r['title'], 80);
  const bpm = typeof r['bpm'] === 'number' && Number.isFinite(r['bpm']) ? r['bpm'] : null;
  if (!id || title === null || bpm === null) return null;
  const base = { id, title, bpm };
  if (r['kind'] === 'melody') {
    const notes = clampText(r['notes'], MAX_SONG_TEXT);
    const key = r['key'];
    if (notes === null || typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key > 11)
      return null;
    return { ...base, kind: 'melody', key, notes };
  }
  if (r['kind'] === 'chords') {
    const bars = clampText(r['bars'], MAX_SONG_TEXT);
    const pattern = clampText(r['pattern'], 200);
    if (bars === null || pattern === null) return null;
    return { ...base, kind: 'chords', bars, pattern, beatsPerBar: r['beatsPerBar'] === 3 ? 3 : 4 };
  }
  if (r['kind'] === 'rhythm') {
    const lanes = clampText(r['lanes'], MAX_SONG_TEXT);
    const profile = PERCUSSION_PROFILES.find((p) => p === r['profile']);
    if (lanes === null || !profile) return null;
    return {
      ...base,
      kind: 'rhythm',
      profile,
      lanes,
      stepsPerBeat: r['stepsPerBeat'] === 3 ? 3 : 2,
    };
  }
  return null;
}

/** The songs a player wrote, kept in a key-value store; tolerant of missing, blocked or corrupt storage. */
export class UserSongStore {
  private songs: UserSong[];

  constructor(private readonly store: KeyValueStore | null) {
    this.songs = this.read();
  }

  /** The songs, oldest first. */
  list(): UserSong[] {
    return this.songs.map((s) => ({ ...s }));
  }

  get(id: string): UserSong | null {
    const s = this.songs.find((x) => x.id === id);
    return s ? { ...s } : null;
  }

  /**
   * Saves a song (new when `id` is empty or unknown). Returns the saved song, or null if there is no
   * room for another or the text does not make a song.
   */
  save(song: NewUserSong, now = Date.now()): UserSong | null {
    this.songs = this.read();
    const existing = song.id ? this.songs.findIndex((s) => s.id === song.id) : -1;
    if (existing < 0 && this.songs.length >= MAX_USER_SONGS) return null;
    const id = existing >= 0 ? song.id! : `my-${now.toString(36)}${this.songs.length.toString(36)}`;
    const saved = sanitize({ ...song, id });
    if (!saved || !compileSong(saved).ok) return null;
    if (existing >= 0) this.songs[existing] = saved;
    else this.songs.push(saved);
    this.write();
    return { ...saved };
  }

  delete(id: string): void {
    this.songs = this.read().filter((s) => s.id !== id);
    this.write();
  }

  private write(): void {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.songs));
    } catch {
      // private window / quota: keep working in memory
    }
  }

  private read(): UserSong[] {
    try {
      const text = this.store?.getItem(KEY);
      if (!text) return this.songs ?? [];
      const raw = JSON.parse(text) as unknown;
      return Array.isArray(raw)
        ? raw.flatMap((r) => {
            const s = sanitize(r);
            return s ? [s] : [];
          })
        : [];
    } catch {
      return [];
    }
  }
}

/** The player's songs that suit an instrument profile, ready for a song menu. */
export function userSongsFor(
  profileId: string,
  store: UserSongStore,
): { id: string; chart: Chart; category: 'song' }[] {
  const out: { id: string; chart: Chart; category: 'song' }[] = [];
  for (const song of store.list()) {
    const compiled = compileSong(song);
    if (!compiled.ok) continue;
    const match = compiled.charts.find((c) => c.profileId === profileId);
    if (match) out.push({ id: song.id, chart: match.chart, category: 'song' });
  }
  return out;
}

/** The title and difficulty of one of the player's songs by id, or null if there is no such song. */
export function lookupUserSong(
  id: string,
  store: UserSongStore,
): { title: string; rating: number } | null {
  const song = store.get(id);
  if (!song) return null;
  const compiled = compileSong(song);
  if (!compiled.ok) return null;
  return { title: song.title, rating: rateChart(compiled.charts[0]!.chart).score };
}
