import { getSong } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { COURSES, courseProgress, hashParam, stepHref } from './courses';

describe('COURSES', () => {
  it('only name songs that exist, for the instrument the course is for', () => {
    for (const course of COURSES) {
      expect(course.steps.length, course.id).toBeGreaterThanOrEqual(6);
      for (const step of course.steps) {
        const song = getSong(step.songId); // throws for an unknown id
        expect(song.meta.instruments, `${course.id} ${step.songId}`).toContain(course.profileId);
        expect(step.focus.length).toBeGreaterThan(3);
      }
      expect(new Set(course.steps.map((s) => s.songId)).size, course.id).toBe(course.steps.length);
    }
  });

  it('get harder: the last third is rated no easier than the first third, on average', async () => {
    const { rateChart } = await import('@lineup/core');
    for (const course of COURSES) {
      const scores = course.steps.map((s) => rateChart(getSong(s.songId)).score);
      const third = Math.floor(scores.length / 3);
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      expect(mean(scores.slice(-third)), course.id).toBeGreaterThanOrEqual(
        mean(scores.slice(0, third)),
      );
    }
  });
});

describe('courseProgress', () => {
  const course = COURSES[0]!;
  const stars = (m: Record<string, number>) => (id: string) => m[id] ?? null;

  it('opens only the first step to a new player', () => {
    const p = courseProgress(course, stars({}));
    expect(p.steps.map((s) => s.state)).toEqual([
      'open',
      ...Array(course.steps.length - 1).fill('locked'),
    ]);
    expect(p.mastered).toBe(0);
    expect(p.done).toBe(false);
  });

  it('opens the next step after one star, and counts two stars as mastered', () => {
    const [a, b, c] = course.steps;
    const p = courseProgress(course, stars({ [a!.songId]: 1, [b!.songId]: 2 }));
    expect(p.steps[0]).toMatchObject({ state: 'cleared', stars: 1 });
    expect(p.steps[1]).toMatchObject({ state: 'mastered', stars: 2 });
    expect(p.steps[2]).toMatchObject({ state: 'open', stars: null });
    expect(p.steps[3]!.state).toBe('locked');
    expect(c!.songId).toBeDefined();
    expect(p.mastered).toBe(1);
  });

  it('keeps later steps locked behind a step that has not been cleared', () => {
    const p = courseProgress(course, stars({ [course.steps[2]!.songId]: 3 }));
    expect(p.steps[2]!.state).toBe('locked'); // the first step was never cleared
  });

  it('is done when every step is mastered', () => {
    const all = Object.fromEntries(course.steps.map((s) => [s.songId, 3]));
    expect(courseProgress(course, stars(all))).toMatchObject({
      mastered: course.steps.length,
      done: true,
    });
  });
});

describe('links', () => {
  it('builds a link to a step and reads its parameters back', () => {
    const kit = COURSES.find((c) => c.mode === 'drum-kit')!;
    const href = stepHref(kit, kit.steps[0]!);
    expect(href).toBe('#/beat?song=ex-drum-kit-kick-snare&mode=drum-kit');
    expect(hashParam(href, 'song')).toBe('ex-drum-kit-kick-snare');
    expect(hashParam(href, 'mode')).toBe('drum-kit');
    expect(hashParam('#/sing', 'song')).toBeNull();
    expect(hashParam('#/sing?song=%E0%A4%A', 'song')).toBeNull();
    expect(stepHref(COURSES[0]!, COURSES[0]!.steps[0]!)).toBe('#/sing?song=sing-hot-cross-buns');
  });
});
