import { describe, expect, it } from 'vitest';
import { isPlainVariant, scoreRows, sortRows, starsBySong, variantLabel } from './scoreboard';

const best = (score: number, accuracy: number, at = '2026-10-11T10:00:00.000Z') => ({
  score,
  accuracy,
  grade: 'A',
  at,
});

describe('variantLabel', () => {
  it('says in words how a song was played, and nothing for the usual way', () => {
    expect(variantLabel('normal')).toBe('');
    expect(variantLabel('normal|x1|anyoctave')).toBe('');
    expect(variantLabel('x0.8+chords|harder')).toBe('0.8× speed, chords checked, harder version');
    expect(variantLabel('strict|easier')).toBe('strict scoring, easier version');
  });
});

describe('scoreRows', () => {
  const rows = scoreRows([
    { key: 'voice|sing-hot-cross-buns|normal', best: best(900, 0.97) },
    {
      key: 'ukulele-strum|strum-blues|x0.8|harder',
      best: best(500, 0.7, '2026-10-12T10:00:00.000Z'),
    },
    { key: 'voice|gen-major-easy-1|normal', best: best(300, 0.5) },
    { key: 'clap|gone-song|', best: best(100, 0.2) },
    { key: 'mystery|x|', best: best(1, 1) },
    { key: 'ear|ear-intervals-hard|', best: best(700, 0.8) },
  ]);

  it('finds titles, difficulty and stars, and skips profiles it does not know', () => {
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      game: 'Singline',
      title: 'Hot Cross Buns',
      stars: 3,
      how: '',
    });
    expect(rows[0]!.rating).toBeGreaterThanOrEqual(1);
    expect(rows[1]).toMatchObject({
      game: 'Strumline',
      how: '0.8× speed, harder version',
      stars: 1,
    });
  });

  it('names ear-training rounds', () => {
    expect(rows[4]).toMatchObject({
      game: 'Ear training',
      title: 'Ear training: intervals, hard',
      rating: 8,
    });
  });

  it('shows the id of a song this version no longer has', () => {
    expect(rows[3]).toMatchObject({ title: 'gone-song', rating: null, game: 'Beatline' });
  });

  it('sorts by recency, score, stars and difficulty', () => {
    expect(sortRows(rows, 'recent')[0]!.game).toBe('Strumline');
    expect(sortRows(rows, 'score').map((r) => r.score)).toEqual([900, 700, 500, 300, 100]);
    expect(sortRows(rows, 'stars')[0]!.stars).toBe(3);
    const hardest = sortRows(rows, 'hardest');
    expect((hardest[0]!.rating ?? 0) >= (hardest[1]!.rating ?? 0)).toBe(true);
  });
});

describe('scoreRows with the player’s own songs', () => {
  it('uses their title and difficulty', () => {
    const rows = scoreRows([{ key: 'voice|my-abc|normal', best: best(300, 0.9) }], (id) =>
      id === 'my-abc' ? { title: 'My tune', rating: 4 } : null,
    );
    expect(rows[0]).toMatchObject({ title: 'My tune', rating: 4, game: 'Singline' });
    expect(scoreRows([{ key: 'voice|my-gone|normal', best: best(1, 1) }])[0]!.title).toBe(
      'my-gone',
    );
  });
});

describe('variant labels for every way of playing', () => {
  it('says strict scoring, a part and listen first in words', () => {
    expect(variantLabel('strict')).toBe('strict scoring');
    expect(variantLabel('normal|part3')).toBe('part 3');
    expect(variantLabel('normal|x0.8|part2|echo')).toBe('0.8× speed, part 2, listen first');
    expect(variantLabel('normal|mixed')).toBe('mixed version');
  });

  it('knows which ways are the plain way', () => {
    for (const v of [
      '',
      'normal',
      'strict',
      'normal|x1|anyoctave',
      'x1',
      'x1+chords'.replace('+chords', ''),
    ])
      expect(isPlainVariant(v), v).toBe(true);
    for (const v of [
      'normal|part1',
      'normal|echo',
      'normal|easier',
      'x0.8',
      'x1+chords',
      'normal|mixed',
    ])
      expect(isPlainVariant(v), v).toBe(false);
  });

  it('counts only plain plays toward a learning path', () => {
    const stars = starsBySong(
      [
        { key: 'voice|a|normal|part2', best: best(1, 0.99) },
        { key: 'voice|b|normal', best: best(1, 0.85) },
        { key: 'voice|b|normal|easier', best: best(1, 0.99) },
      ],
      'voice',
      true,
    );
    expect(stars.has('a')).toBe(false);
    expect(stars.get('b')).toBe(2);
  });
});

describe('starsBySong', () => {
  it('keeps the most stars a song earned in any way of playing it, for one profile', () => {
    const stars = starsBySong(
      [
        { key: 'voice|a|normal', best: best(1, 0.65) },
        { key: 'voice|a|normal|easier', best: best(1, 0.99) },
        { key: 'voice|b|normal', best: best(1, 0.3) },
        { key: 'wind|a|normal', best: best(1, 1) },
      ],
      'voice',
    );
    expect(stars.get('a')).toBe(3);
    expect(stars.get('b')).toBe(0);
    expect(stars.has('c')).toBe(false);
    expect([...stars.keys()].sort()).toEqual(['a', 'b']);
  });
});
