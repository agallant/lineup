import { chordFrets, describeFingering } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { chordDiagramSvg } from './chord-diagram';

const svg = (name: string, profile?: string) =>
  chordDiagramSvg(describeFingering(chordFrets(profile, name)!), name);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('chordDiagramSvg', () => {
  it('draws a dot for every held string and a ring for every open one', () => {
    const c = svg('C'); // ukulele: 0 0 0 3
    expect(count(c, /<circle[^>]*fill="var\(--accent/g)).toBe(1);
    expect(count(c, /<circle[^>]*fill="none"/g)).toBe(3);
    expect(c).toContain('aria-label="C: 0 0 0 3"');
  });

  it('crosses out muted strings on the guitar', () => {
    const c = svg('C', 'guitar-strum'); // x 3 2 0 1 0
    expect(count(c, /×/g)).toBe(1);
    expect(c).toContain('aria-label="C: x 3 2 0 1 0"');
  });

  it('draws a bar for a barre and labels a shape up the neck', () => {
    const b = svg('B', 'guitar-strum'); // x 2 4 4 4 2
    expect(count(b, /<rect/g)).toBe(1);
    const f = svg('Ab', 'guitar-strum'); // 4 6 6 5 4 4
    expect(f).toContain('4fr');
  });

  it('has no bar for an open chord', () => {
    expect(count(svg('G', 'guitar-strum'), /<rect/g)).toBe(0);
  });
});
