import { describe, expect, it } from 'vitest';
import { COURSES } from './courses';
import {
  completedCourse,
  recordTimeline,
  suggestNext,
  isPlainVariant,
  scoreRows,
  sortRows,
  starsBySong,
  variantLabel,
} from './scoreboard';

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
    expect(variantLabel('normal|echo|blind')).toBe('listen first, unseen');
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

describe('completedCourse', () => {
  it('finds a path with every step mastered, and keeps stars from the most accurate play', () => {
    const course = COURSES[0]!;
    const entry = (songId: string, accuracy: number, bestAccuracy?: number) => ({
      key: `${course.profileId}|${songId}|normal`,
      best: {
        score: 1,
        accuracy,
        ...(bestAccuracy === undefined ? {} : { bestAccuracy }),
        grade: 'A',
        at: '2026-01-01',
      },
    });
    expect(completedCourse([])).toBeNull();
    const weak = course.steps.map((s) => entry(s.songId, 0.7));
    expect(completedCourse(weak)).toBeNull();
    const done = course.steps.map((s) => entry(s.songId, 0.7, 0.96));
    expect(completedCourse(done)?.id).toBe(course.id);
  });
});

describe('suggestNext', () => {
  const entry = (profile: string, songId: string, at: string) => ({
    key: `${profile}|${songId}|normal`,
    best: { score: 1, accuracy: 0.7, grade: 'B', at },
  });

  it('starts with the first step of the first path for a new player', () => {
    const next = suggestNext([])!;
    expect(next.course.id).toBe(COURSES[0]!.id);
    expect(next.step.songId).toBe(COURSES[0]!.steps[0]!.songId);
  });

  it('continues the path played most recently', () => {
    const wind = COURSES.find((c) => c.profileId === 'wind')!;
    const next = suggestNext([entry('wind', wind.steps[0]!.songId, '2026-10-11T10:00:00Z')])!;
    expect(next.course.id).toBe(wind.id);
    expect(next.step.songId).toBe(wind.steps[1]!.songId);
  });
});

describe('suggestNext ranking', () => {
  it('ignores songs outside a path and ranks by the latest play, not the best score’s time', () => {
    const voice = COURSES.find((c) => c.profileId === 'voice')!;
    const wind = COURSES.find((c) => c.profileId === 'wind')!;
    const entry = (profile: string, songId: string, at: string, lastPlayed?: string) => ({
      key: `${profile}|${songId}|normal`,
      best: { score: 1, accuracy: 0.7, grade: 'B', at, ...(lastPlayed ? { lastPlayed } : {}) },
    });
    // a recent voice song that is in no path does not make a voice path "recent"
    const outside = suggestNext([
      entry('voice', 'sing-not-in-a-path', '2026-10-12T10:00:00Z'),
      entry('wind', wind.steps[0]!.songId, '2026-10-10T10:00:00Z'),
    ])!;
    expect(outside.course.id).toBe(wind.id);
    // the voice best was set long ago but replayed since
    const replayed = suggestNext([
      entry('voice', voice.steps[0]!.songId, '2026-10-01T10:00:00Z', '2026-10-12T10:00:00Z'),
      entry('wind', wind.steps[0]!.songId, '2026-10-10T10:00:00Z'),
    ])!;
    expect(replayed.course.id).toBe(voice.id);
  });
});

describe('recordTimeline', () => {
  const entry = (
    key: string,
    score: number,
    at: string,
    history: { score: number; accuracy: number; at: string }[] = [],
  ) => ({
    key,
    best: { score, accuracy: score / 1000, grade: 'B', at, history },
  });

  it('lists each time a best was set, newest first, with what it improved on', () => {
    const entries = [
      entry('voice|sing-hot-cross-buns|normal', 900, '2026-10-05T10:00:00Z', [
        { score: 500, accuracy: 0.5, at: '2026-10-01T10:00:00Z' },
        { score: 700, accuracy: 0.7, at: '2026-10-03T10:00:00Z' },
      ]),
      entry('wind|wind-ode|normal', 600, '2026-10-04T10:00:00Z'),
    ];
    const rows = scoreRows(entries);
    const events = recordTimeline(entries, rows);
    expect(events.map((e) => `${e.title}:${e.score}`)).toEqual([
      'Hot Cross Buns:900',
      'Ode to Joy:600',
      'Hot Cross Buns:700',
      'Hot Cross Buns:500',
    ]);
    expect(events[0]!.before).toEqual({ score: 700, accuracy: 0.7 });
    expect(events[1]!.before).toBeNull(); // the first score on that song
    expect(events[3]!.before).toBeNull();
    expect(recordTimeline(entries, rows, 2)).toHaveLength(2);
  });

  it('skips songs this version does not know, and tolerates scores with no history', () => {
    const entries = [entry('nobody|x|normal', 1, '2026-10-01T00:00:00Z')];
    expect(recordTimeline(entries, scoreRows(entries))).toEqual([]);
  });
});
