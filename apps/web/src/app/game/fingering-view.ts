import {
  activeNoteIndex,
  fingeringFor,
  holeGroups,
  midiLabel,
  nextNoteIndex,
  windScale,
  type Chart,
  type Fingering,
  type WindInstrument,
} from '@lineup/core';

/** The holes covered, as numbers a screen reader can say: "holes 1, 2, 3 covered" or "all holes open". */
function spoken(f: Fingering, family: WindInstrument['family']): string {
  const names: string[] = [];
  const thumb = family === 'recorder';
  [...f.holes].forEach((h, i) => {
    if (h === '1') names.push(thumb ? (i === 0 ? 'thumb' : String(i)) : String(i + 1));
  });
  return names.length === 0 ? 'all holes open' : `covered: ${names.join(', ')}`;
}

/** A row of circles for one fingering: filled = covered, hollow = open, grouped by hand. */
export function holesHtml(family: WindInstrument['family'], f: Fingering): string {
  const groups = holeGroups(family);
  let at = 0;
  const parts = groups.map((size) => {
    const circles = [...f.holes.slice(at, at + size)]
      .map((h) => `<span class="hole${h === '1' ? ' on' : ''}"></span>`)
      .join('');
    at += size;
    return `<span class="hole-group">${circles}</span>`;
  });
  return `<span class="holes" role="img" aria-label="${spoken(f, family)}">${parts.join('')}</span>`;
}

/**
 * The fingering chart for an instrument: its scale from the lowest note, one row each, with
 * the notes the chosen song uses highlighted. An instrument with no chart says so.
 */
export function fingeringChartHtml(instrument: WindInstrument, used: ReadonlySet<number>): string {
  const scale = windScale(instrument);
  if (scale.length === 0) {
    return `<p>No fingering chart is shown for this instrument: charts differ between makers, so use the one that came with yours.</p>`;
  }
  const rows = scale
    .map(
      (n) =>
        `<div class="fing-row${used.has(n.midi) ? ' used' : ''}"><span class="fing-note">${n.label}</span>${holesHtml(instrument.family, n.fingering)}${n.fingering.harder ? '<span class="fing-hint">blow harder</span>' : ''}</div>`,
    )
    .join('');
  const thumb = instrument.family === 'recorder' ? ' The first circle is the thumb hole.' : '';
  return `${rows}<p class="fing-key">Filled circle: hole covered. Hollow: open.${thumb} Notes in this song are highlighted. Sharps and flats outside the key vary between instruments, so they are not shown: use your instrument's own chart for those.</p>`;
}

/** One note in the play-time strip: its name and the holes, or a dash when there is no fingering to show. */
function noteHtml(instrument: WindInstrument, midi: number, cls: string): string {
  const f = fingeringFor(instrument, midi);
  const holes = f ? holesHtml(instrument.family, f) : '<span class="holes-none">–</span>';
  const hint = f?.harder ? '<span class="fing-hint">blow harder</span>' : '';
  return `<div class="${cls}"><span class="fing-note">${midiLabel(midi)}</span>${holes}${hint}</div>`;
}

/**
 * What to show while playing: the note being played (or, between notes, the one coming up)
 * and the next one after it. Returns an empty string when the instrument has no chart.
 */
export function fingeringStripHtml(
  instrument: WindInstrument,
  chart: Pick<Chart, 'notes'>,
  time: number,
): string {
  if (windScale(instrument).length === 0) return '';
  const now = activeNoteIndex(chart, time);
  const next = nextNoteIndex(chart, time);
  const first = now ?? next;
  if (first === null) return '';
  const second = now === null ? nextAfter(chart, first) : next;
  const pitch = (i: number | null) => (i === null ? undefined : chart.notes[i]?.pitch);
  const a = pitch(first);
  const b = pitch(second);
  return [
    a === undefined ? '' : noteHtml(instrument, a, now === null ? 'fing-next' : 'fing-now'),
    b === undefined || second === first ? '' : noteHtml(instrument, b, 'fing-next'),
  ].join('');
}

function nextAfter(chart: Pick<Chart, 'notes'>, index: number): number | null {
  return index + 1 < chart.notes.length ? index + 1 : null;
}
