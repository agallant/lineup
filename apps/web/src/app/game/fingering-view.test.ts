import { findWindInstrument, getSong, shiftForInstrument, transposeChart } from '@lineup/core';
import { describe, expect, it } from 'vitest';
import { fingeringChartHtml, fingeringStripHtml, holesHtml } from './fingering-view';

const dWhistle = findWindInstrument('whistle-d')!;
const recorder = findWindInstrument('recorder-soprano')!;
const ocarina = findWindInstrument('ocarina-c12')!;

/** The scale song moved into the instrument's key, as the screen plays it. */
const played = (inst: typeof dWhistle) => {
  const chart = getSong('wind-scale');
  return transposeChart(chart, shiftForInstrument(chart, inst));
};

describe('holesHtml', () => {
  it('draws a filled circle for a covered hole and a hollow one for an open hole, grouped by hand', () => {
    const html = holesHtml('whistle', { holes: '111000', harder: false });
    expect(html.match(/class="hole on"/g)).toHaveLength(3);
    expect(html.match(/class="hole"/g)).toHaveLength(3);
    expect(html.match(/hole-group/g)).toHaveLength(2);
  });

  it('says it in words for a screen reader', () => {
    expect(holesHtml('whistle', { holes: '110000', harder: false })).toContain('covered: 1, 2');
    expect(holesHtml('whistle', { holes: '000000', harder: true })).toContain('all holes open');
    expect(holesHtml('recorder', { holes: '10100000', harder: false })).toContain(
      'covered: thumb, 2',
    );
  });

  it('draws the thumb hole of a recorder as its own group', () => {
    expect(
      holesHtml('recorder', { holes: '11111111', harder: false }).match(/hole-group/g),
    ).toHaveLength(3);
  });
});

describe('fingeringChartHtml', () => {
  it("lists the scale in the instrument's key and highlights the notes of the song", () => {
    const song = played(dWhistle);
    const used = new Set(song.notes.map((n) => n.pitch!));
    const html = fingeringChartHtml(dWhistle, used);
    expect(html.indexOf('D5')).toBeLessThan(html.indexOf('E5'));
    expect(html).toContain('blow harder'); // the second octave
    // the scale song uses D E F# G A B: six highlighted rows
    expect(html.match(/fing-row used/g)).toHaveLength(6);
    expect(html).toMatch(/Hollow: open/);
  });

  it('mentions the thumb hole for a recorder only', () => {
    expect(fingeringChartHtml(recorder, new Set())).toMatch(/thumb hole/);
    expect(fingeringChartHtml(dWhistle, new Set())).not.toMatch(/thumb hole/);
  });

  it('says there is no chart for an instrument without one', () => {
    expect(fingeringChartHtml(ocarina, new Set())).toMatch(/No fingering chart/);
  });
});

describe('fingeringStripHtml', () => {
  const chart = played(dWhistle); // D E F# G A B B A G F# E D at 80 bpm

  it('shows the note being played and the next one', () => {
    const html = fingeringStripHtml(dWhistle, chart, chart.notes[1]!.t + 0.1);
    expect(html).toMatch(/fing-now"><span class="fing-note">E5/);
    expect(html).toMatch(/fing-next"><span class="fing-note">F#5/);
  });

  it('between notes it shows the one coming up and the one after', () => {
    const gap = chart.notes[0]!.t + chart.notes[0]!.duration + 0.02;
    const html = fingeringStripHtml(dWhistle, chart, gap);
    expect(html).not.toContain('fing-now');
    expect(html).toContain('E5');
  });

  it('before the first note it shows the first two', () => {
    const html = fingeringStripHtml(dWhistle, chart, -3);
    expect(html).toMatch(/fing-next"><span class="fing-note">D5/);
    expect(html).toContain('E5');
  });

  it('at the last note there is nothing after it, and after the end there is nothing', () => {
    const last = chart.notes.at(-1)!;
    const html = fingeringStripHtml(dWhistle, chart, last.t + 0.05);
    expect(html.match(/fing-note/g)).toHaveLength(1);
    expect(fingeringStripHtml(dWhistle, chart, last.t + last.duration + 5)).toBe('');
  });

  it("shows a dash for a note outside the instrument's scale", () => {
    const odd = { notes: [{ t: 0, duration: 1, pitch: 73 }] }; // C#5 is not in D major
    expect(fingeringStripHtml(dWhistle, odd, 0.1)).toContain('holes-none');
  });

  it('shows nothing for an instrument with no chart', () => {
    expect(fingeringStripHtml(ocarina, chart, 1)).toBe('');
  });
});
