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
  const covered: string[] = [];
  const half: string[] = [];
  const thumb = family === 'recorder';
  const name = (i: number) => (thumb ? (i === 0 ? 'thumb' : String(i)) : String(i + 1));
  [...f.holes].forEach((h, i) => {
    if (h === '1') covered.push(name(i));
    else if (h === '2') half.push(name(i));
  });
  const parts = [
    covered.length ? `covered: ${covered.join(', ')}` : '',
    half.length ? `half covered: ${half.join(', ')}` : '',
  ].filter(Boolean);
  return parts.length === 0 ? 'all holes open' : parts.join('; ');
}

/** A row of circles for one fingering: filled = covered, hollow = open, grouped by hand. */
export function holesHtml(family: WindInstrument['family'], f: Fingering): string {
  // an instrument with note names and no hole diagram (the shakuhachi) shows the name
  if (f.holes === '' && f.name !== undefined) {
    return `<span class="fing-name" role="img" aria-label="${f.name.replaceAll('↑', ' high')}">${f.name}</span>`;
  }
  const groups = holeGroups(family);
  let at = 0;
  const parts = groups.map((size) => {
    const circles = [...f.holes.slice(at, at + size)]
      .map((h) => `<span class="hole${h === '1' ? ' on' : h === '2' ? ' half' : ''}"></span>`)
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
    return `<p>No fingering chart for a generic instrument: choose a specific whistle or recorder above to see its fingerings, or use the chart that came with yours.</p>`;
  }
  const rows = scale
    .map((n) =>
      // an instrument with its own note names leads with the name and gives the Western one after it
      n.fingering.holes === '' && n.fingering.name !== undefined
        ? `<div class="fing-row${used.has(n.midi) ? ' used' : ''}${n.chromatic ? ' chromatic' : ''}">${holesHtml(instrument.family, n.fingering)}<span class="fing-note">(${n.label})</span>${hintHtml(n)}</div>`
        : `<div class="fing-row${used.has(n.midi) ? ' used' : ''}${n.chromatic ? ' chromatic' : ''}"><span class="fing-note">${n.label}</span>${holesHtml(instrument.family, n.fingering)}${hintHtml(n)}</div>`,
    )
    .join('');
  if (instrument.family === 'shakuhachi') {
    return `${rows}<p class="fing-key">Notes in this song are highlighted, with their traditional syllables (Ro Tsu Re Chi Ri), and the Western note name in brackets; an arrow marks the higher octave (kan), played with a stronger, more focused breath. Fingerings, and the half-hole and meri notes between these, differ between schools (Kinko, Tozan and others): use your teacher’s chart.</p>`;
  }
  const own =
    instrument.family === 'native-flute'
      ? ' Open the holes one at a time from the bottom to climb the scale. The upper register reuses the fingerings with a stronger breath. Makers differ a little: check them against your own flute.'
      : '';
  const thumb = instrument.family === 'recorder' ? ' The first circle is the thumb hole.' : '';
  if (own) {
    return `${rows}<p class="fing-key">Filled circle: hole covered. Hollow: open. Notes in this song are highlighted.${own}</p>`;
  }
  return `${rows}<p class="fing-key">Filled circle: hole covered. Hollow: open. Half-filled: half covered.${thumb} Notes in this song are highlighted. Sharps and flats (grey) are the commonly taught cross-fingerings and half-holes: they vary between instruments, so check them against your own.</p>`;
}

/** The small notes beside a row: a chromatic note's technique, and a whistle's stronger breath. */
function hintHtml(n: { fingering: Fingering; chromatic: boolean }): string {
  const hints: string[] = [];
  if (n.chromatic) hints.push(n.fingering.holes.includes('2') ? 'half-hole' : 'cross-fingering');
  if (n.fingering.harder) hints.push('blow harder');
  return hints.map((h) => `<span class="fing-hint">${h}</span>`).join('');
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
