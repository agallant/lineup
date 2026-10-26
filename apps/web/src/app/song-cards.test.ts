import { describe, expect, it } from 'vitest';
import { matchesFind, songCards } from './song-cards';

const card = (n: number, done = false) => ({ html: `<li>${n}</li>`, done });

describe('song cards', () => {
  it('show a short group whole', () => {
    const html = songCards([1, 2, 3].map((n) => card(n)));
    expect(html).not.toContain('<details');
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it('fold a long group after the first few, keeping every song', () => {
    const html = songCards(
      Array.from({ length: 20 }, (_, i) => card(i)),
      6,
    );
    expect(html).toContain('Show all 20 songs');
    expect(html.match(/<li>/g)).toHaveLength(20);
    expect(html.indexOf('<details')).toBeGreaterThan(html.indexOf('<li>5</li>'));
  });

  it('put the songs still to clear first', () => {
    const html = songCards([card(1, true), card(2), card(3, true), card(4)]);
    expect(html.indexOf('<li>2</li>')).toBeLessThan(html.indexOf('<li>1</li>'));
    expect(html.indexOf('<li>4</li>')).toBeLessThan(html.indexOf('<li>3</li>'));
  });

  it('offer a find box only for a long group', () => {
    expect(songCards(Array.from({ length: 20 }, (_, i) => card(i)))).not.toContain('song-find');
    expect(songCards(Array.from({ length: 50 }, (_, i) => card(i)))).toContain('song-find');
  });

  it('match what was typed in any case, and everything when empty', () => {
    expect(matchesFind('★★☆ Hey Jude', 'jude')).toBe(true);
    expect(matchesFind('★★☆ Hey Jude', 'let it')).toBe(false);
    expect(matchesFind('★★☆ Hey Jude', '  ')).toBe(true);
  });
});
