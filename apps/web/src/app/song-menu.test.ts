import { describe, expect, it } from 'vitest';
import { songMenuGroups, type MenuSong } from './song-menu';

const song = (id: string, category: MenuSong['category']): MenuSong => ({
  id,
  chart: { meta: { title: `Title ${id}` } },
  category,
});

describe('songMenuGroups', () => {
  it('puts songs before exercises under headings, keeping each group in order', () => {
    const groups = songMenuGroups([
      song('e1', 'exercise'),
      song('s1', 'song'),
      song('e2', 'exercise'),
      song('s2', 'song'),
    ]);
    expect(groups).toEqual([
      {
        label: 'Songs',
        items: [
          { id: 's1', title: 'Title s1' },
          { id: 's2', title: 'Title s2' },
        ],
      },
      {
        label: 'Exercises',
        items: [
          { id: 'e1', title: 'Title e1' },
          { id: 'e2', title: 'Title e2' },
        ],
      },
    ]);
  });

  it('uses no heading when there is only one kind of entry', () => {
    expect(songMenuGroups([song('a', 'song'), song('b', 'song')])).toEqual([
      {
        label: null,
        items: [
          { id: 'a', title: 'Title a' },
          { id: 'b', title: 'Title b' },
        ],
      },
    ]);
    expect(songMenuGroups([song('x', 'exercise')])[0]!.label).toBeNull();
  });

  it('is empty for no songs', () => {
    expect(songMenuGroups([])).toEqual([]);
  });
});
