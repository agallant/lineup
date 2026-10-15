import { describe, expect, it } from 'vitest';
import { GUITAR_CHORD_FRETS, UKULELE_CHORD_FRETS } from '../chords';
import { getSong, songsFor } from './index';
import { POP_DATA } from './pop-data';
import { POP_FAVORITES, POP_SONGS, popChart, popId, popPattern } from './pop';

describe('pop songs', () => {
  it('has a few hundred, each a valid strum chart with a unique id', () => {
    expect(POP_DATA.length).toBeGreaterThan(150);
    const ids = POP_DATA.map(popId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getSong(id).meta.instruments).toEqual(['ukulele-strum']);
  });

  it('shortens a long id with a hash, so long titles by one artist stay apart', () => {
    const a = popId({ artist: 'Some Band', title: 'A very long song title '.repeat(6) + 'one' });
    const b = popId({ artist: 'Some Band', title: 'A very long song title '.repeat(6) + 'two' });
    expect(a.length).toBeLessThanOrEqual(72);
    expect(a).not.toBe(b);
    expect(popId({ artist: 'The Beatles', title: 'Help!' })).toBe('pop-beatles-help');
  });

  it('has no doubled quotes in a title, and no lost apostrophes', () => {
    for (const s of POP_DATA) expect(s.title, s.title).not.toContain('""');
    const titles = POP_DATA.map((s) => s.title);
    expect(titles).toContain("Somebody's Watching Me");
    expect(titles.some((t) => /Kokomo \(From The "Cocktail" Soundtrack\)/.test(t))).toBe(true);
  });

  it('uses only chords the ukulele and the guitar have fingerings for', () => {
    for (const s of POP_DATA) {
      for (const chord of s.bars.split(/[|\s]+/).filter(Boolean)) {
        expect(UKULELE_CHORD_FRETS[chord], `${s.title}: ${chord}`).toBeDefined();
        expect(GUITAR_CHORD_FRETS[chord], `${s.title}: ${chord}`).toBeDefined();
      }
    }
  });

  it('has the Beatles, playable on both instruments', () => {
    const beatles = POP_DATA.filter((s) => /beatles/i.test(s.artist));
    expect(beatles.length).toBeGreaterThanOrEqual(6);
    for (const s of beatles) {
      expect(songsFor('ukulele-strum').some((x) => x.id === popId(s))).toBe(true);
      expect(songsFor('guitar-strum').some((x) => x.id === popId(s))).toBe(true);
    }
  });

  it('keeps strums to a playable rate at every tempo', () => {
    for (const s of POP_DATA) {
      const chart = popChart(s);
      const bars = s.bars.split('|').length;
      const perSecond = chart.notes.length / ((bars * s.beatsPerBar * 60) / s.bpm);
      expect(perSecond, s.title).toBeLessThan(6.5);
      expect(chart.notes.length).toBeGreaterThan(bars);
    }
  });

  it('changes chord halfway through a bar that names two', () => {
    const chart = popChart({
      title: 'x',
      artist: 'y',
      year: 2000,
      peak: 1,
      beatsPerBar: 4,
      steps: 2,
      bpm: 80,
      capo: 0,
      up: 0,
      bars: 'C G',
    });
    const chords = chart.notes.map((n) => n.expected && 'chord' in n.expected && n.expected.chord);
    expect(chords).toEqual(['C', 'C', 'C', 'G', 'G', 'G']);
  });

  it('names the capo or the move in the artist line, and picks a pattern by meter', () => {
    const withCapo = POP_DATA.find((s) => s.capo > 0)!;
    expect(POP_SONGS[popId(withCapo)]!.meta.artist).toContain(`capo ${withCapo.capo}`);
    expect(popPattern(3, 2, 90).replace(/ /g, '')).toHaveLength(6);
    expect(popPattern(4, 2, 70).replace(/ /g, '')).toHaveLength(8);
    expect(popPattern(2, 3, 60).replace(/ /g, '')).toHaveLength(6);
    expect(POP_FAVORITES.size).toBeGreaterThan(40);
  });
});
