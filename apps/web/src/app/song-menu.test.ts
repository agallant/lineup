import { chartFromBeats, getSong, type Chart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { songMenuGroups, type MenuSong } from './song-menu';

/** A chart of `n` quarter-note hits, one per beat: more hits per second is a harder rhythm. */
const rhythm = (title: string, bpm: number): Chart =>
  chartFromBeats(
    { title, bpm },
    Array.from({ length: 8 }, (_, i) => ({ beat: i * 0.5 })),
  );

const song = (id: string, category: MenuSong['category'], bpm = 60): MenuSong => ({
  id,
  chart: rhythm(`Title ${id}`, bpm),
  category,
});

const ids = (g: ReturnType<typeof songMenuGroups>[number]) => g.items.map((i) => i.id);

describe('songMenuGroups', () => {
  it('puts songs before exercises under headings', () => {
    const groups = songMenuGroups([
      song('e1', 'exercise'),
      song('s1', 'song'),
      song('e2', 'exercise'),
      song('s2', 'song'),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Songs', 'Exercises']);
    expect(ids(groups[0]!)).toEqual(['s1', 's2']);
    expect(ids(groups[1]!)).toEqual(['e1', 'e2']); // exercises keep their own order
  });

  it('puts the easiest song first, and keeps the given order between equal ones', () => {
    const groups = songMenuGroups([
      song('fast', 'song', 200),
      song('slow-a', 'song', 50),
      song('slow-b', 'song', 50),
    ]);
    expect(ids(groups[0]!)).toEqual(['slow-a', 'slow-b', 'fast']);
  });

  it('says in each title how hard the song is', () => {
    const [group] = songMenuGroups([song('x', 'song')]);
    expect(group!.items[0]!.title).toMatch(
      /^Title x · (Beginner|Easy|Medium|Hard|Expert) [★☆]{5}$/,
    );
  });

  it('says whether a melody is diatonic or chromatic', () => {
    const items = songMenuGroups([
      { id: 'a', chart: getSong('wind-ode'), category: 'song' },
      { id: 'b', chart: getSong('wind-greensleeves'), category: 'song' },
    ])[0]!.items;
    expect(items.find((i) => i.id === 'a')!.title).toMatch(/ · diatonic$/);
    expect(items.find((i) => i.id === 'b')!.title).toMatch(/ · chromatic$/);
  });

  it('uses no heading when there is only one kind of entry', () => {
    const groups = songMenuGroups([song('a', 'song'), song('b', 'song')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBeNull();
    expect(songMenuGroups([song('x', 'exercise')])[0]!.label).toBeNull();
  });

  it('is empty for no songs', () => {
    expect(songMenuGroups([])).toEqual([]);
  });
});

describe('songMenuGroups with stars', () => {
  it('adds the stars earned to played songs only', () => {
    const groups = songMenuGroups([song('a', 'song'), song('b', 'song')], (id) =>
      id === 'a' ? 2 : null,
    );
    const titles = groups.flatMap((g) => g.items.map((i) => i.title));
    expect(titles.find((t) => t.startsWith('Title a'))).toMatch(/ · best ★★☆$/);
    expect(titles.find((t) => t.startsWith('Title b'))).not.toContain('best');
  });
});
