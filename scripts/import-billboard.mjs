// Turns the McGill Billboard chord annotations (CC0, https://ddmal.music.mcgill.ca/research/The_McGill_Billboard_Project_(Chord_Analysis_Dataset))
// into a compact table of chord progressions for Strumline: title, artist, meter, tempo and the chords of the
// verses and choruses, one chord (or two) per bar. Only facts about each song are kept: no melody and no lyrics.
//
//   node scripts/import-billboard.mjs <path to the dataset checkout> [--out <file.json>] [--ts <file.ts>]
//
// Prints a summary; with --out it also writes every convertible song as JSON. With --ts <file> it writes the
// curated set (every song of the dataset that converts to chords Strumline can play) as the TypeScript data module the app uses.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2]?.startsWith('--') ? undefined : process.argv[2];
/** The value after a flag, which must be there and must not itself be a flag. */
function flagValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a file name`);
  return v;
}
const outFile = flagValue('--out');
const tsFile = flagValue('--ts');
if (!dir)
  throw new Error(
    'usage: node scripts/import-billboard.mjs <dataset dir> [--out file.json] [--ts file.ts]',
  );

const NOTE = {
  C: 0,
  'B#': 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  'E#': 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// the chords Strumline has fingerings for
const MAJ = new Set(['C', 'G', 'F', 'D', 'A', 'E', 'Bb']);
const MIN = new Set(['A', 'E', 'D', 'B', 'G', 'C', 'F#']);
const DOM = new Set(['G', 'C', 'A', 'D', 'E', 'B']);

/** A Harte chord ("A:min7/5", "C:maj") as { root, q } with q one of maj, min, 7, or null for no chord. */
function parseChord(tok) {
  if (tok === 'N' || tok === 'X' || tok === '*' || tok === '&pause') return null;
  const m = /^([A-G][b#]?)(?::([^/(]*))?(?:\([^)]*\))?(?:\/\S*)?$/.exec(tok);
  if (!m) return undefined;
  const root = NOTE[m[1]];
  if (root === undefined) return undefined;
  const qual = (m[2] ?? 'maj').trim();
  let q;
  if (
    qual === '' ||
    qual === 'maj' ||
    (/^(maj7|maj9|6|9\)?|add|sus|aug|maj6|5|1)/.test(qual) && !/^9$|^7|^11|^13/.test(qual))
  )
    q = 'maj';
  else if (/^(min|dim|hdim)/.test(qual)) q = 'min';
  else if (/^(7|9|11|13)/.test(qual)) q = '7';
  else if (/^maj/.test(qual)) q = 'maj';
  else q = 'maj';
  if (qual === 'sus4' || qual === 'sus2' || qual === 'sus4(b7)')
    q = qual.includes('b7') ? '7' : 'maj';
  return { root, q };
}

function parseFile(path) {
  const text = readFileSync(path, 'utf8');
  const head = {};
  const sections = [];
  let current = null;
  const times = [];
  for (const line of text.split('\n')) {
    const h = /^# (\w+): (.*)$/.exec(line);
    if (h) {
      head[h[1]] = h[2].trim();
      continue;
    }
    const m = /^([\d.e+-]+)\t(.*)$/.exec(line);
    if (!m) continue;
    const t = Number(m[1]);
    let body = m[2];
    if (body === 'silence' || body === 'end' || body.startsWith('fadeout')) {
      times.push({ t, bars: 0 });
      continue;
    }
    const hd = /^([A-Za-z]'*), ([^,|]*),\s*(.*)$/.exec(body);
    if (hd) {
      current = { name: hd[2].trim().toLowerCase(), bars: [] };
      sections.push(current);
      body = hd[3];
    }
    if (!current) continue;
    const parts = body.split('|').slice(1);
    // the last piece is whatever follows the final bar line (", (voice" and so on)
    parts.pop();
    let n = 0;
    for (const part of parts) {
      // "." holds the chord of the beat before; "(3/4)" marks a bar of another length
      const all = part.trim().split(/\s+/).filter(Boolean);
      if (!all.length) continue;
      if (all.some((t) => /^\(\d+\/\d+\)$/.test(t))) current.irregular = true;
      const toks = all.filter((t) => t !== '.' && t !== '&pause');
      current.bars.push(toks.length ? toks : ['.']);
      n++;
    }
    times.push({ t, bars: n });
  }
  return { head, sections, times };
}

function tempo(times, beatsPerBar) {
  const d = [];
  for (let i = 0; i + 1 < times.length; i++) {
    if (times[i].bars >= 2) d.push((times[i + 1].t - times[i].t) / times[i].bars);
  }
  d.sort((a, b) => a - b);
  const bar = d[Math.floor(d.length / 2)];
  return bar ? (beatsPerBar * 60) / bar : null;
}

const index = new Map();
for (const row of readFileSync(join(dir, 'billboard-2.0-index.csv'), 'utf8').split('\n').slice(1)) {
  const m = /^(\d+),(\d{4})-[^,]*,[^,]*,[^,]*,("[^"]*"|[^,]*),("[^"]*"|[^,]*),(\d*),/.exec(row);
  if (!m) continue;
  // a quoted CSV field writes a quote inside it twice
  const clean = (x) => x.replace(/^"|"$/g, '').replaceAll('""', '"').trim();
  index.set(String(m[1]).padStart(4, '0'), {
    year: Number(m[2]),
    title: clean(m[3]),
    artist: clean(m[4]),
    peak: Number(m[5]) || 99,
  });
}

/**
 * The index lost the apostrophes of some titles (it has "Somebody s Watching Me" and "I m Goin  Down"):
 * a one-letter or short contraction ending after a space gets its apostrophe back, and a dropped one
 * after "in" (Goin Down) too.
 */
function fixTitle(title) {
  return title.replace(/(\w) (s|m|t|re|ve|ll|d)(?= |$)/g, "$1'$2").replace(/(\w)in {2}/g, "$1in' ");
}

const SKIP_SECTIONS =
  /^(intro|outro|coda|fade|ending|tag|spoken|talking|applause|silence|end|interlude|instrumental)/;

const out = [];
const stats = { files: 0, noIndex: 0, noMeter: 0, unparsed: 0, unplayable: 0, short: 0, ok: 0 };
for (const id of readdirSync(join(dir, 'billboard-2.0-salami_chords'))) {
  const path = join(dir, 'billboard-2.0-salami_chords', id, 'salami_chords.txt');
  if (!existsSync(path)) continue;
  stats.files++;
  const { head, sections, times } = parseFile(path);
  const meter = /^(\d+)\/(\d+)$/.exec(head.metre ?? '');
  if (!meter) {
    stats.noMeter++;
    continue;
  }
  const n = Number(meter[1]);
  const d = Number(meter[2]);
  let beatsPerBar;
  let steps;
  if (d === 4 && [2, 3, 4].includes(n)) [beatsPerBar, steps] = [n, 2];
  else if (d === 8 && [6, 9, 12].includes(n)) [beatsPerBar, steps] = [n / 3, 3];
  else {
    stats.noMeter++;
    continue;
  }
  const bpm = tempo(times, beatsPerBar);
  if (!bpm || bpm < 50 || bpm > 200) {
    stats.noMeter++;
    continue;
  }
  // the chords of each section, at most two to a bar; a repeated section is not repeated
  let bad = false;
  const kept = [];
  const seen = new Set();
  let total = 0;
  for (const s of sections) {
    if (SKIP_SECTIONS.test(s.name)) continue;
    const bars = [];
    if (s.irregular) {
      bad = true;
      break;
    }
    for (const toks of s.bars) {
      const chords = toks.map((t) => (t === '.' ? null : parseChord(t)));
      if (chords.some((c) => c === undefined)) bad = true;
      const real = chords.filter(Boolean);
      if (!real.length) {
        bars.push(bars.length ? bars[bars.length - 1] : null);
        continue;
      }
      const pick = real.length > 2 ? [real[0], real[Math.floor(real.length / 2)]] : real;
      bars.push(pick.filter((c, i) => i === 0 || c.root !== pick[0].root || c.q !== pick[0].q));
    }
    if (bars.some((b) => b === null)) {
      bad = true;
      break;
    }
    const key = JSON.stringify(bars);
    if (seen.has(key)) continue;
    seen.add(key);
    if (total + bars.length > 48 && total >= 16) break;
    kept.push(...bars);
    total += bars.length;
    if (total >= 40) break;
  }
  if (bad) {
    stats.unparsed++;
    continue;
  }
  if (kept.length < 12) {
    stats.short++;
    continue;
  }
  // transpose down (a capo) or up so that every chord has a fingering
  let best = null;
  for (let shift = -7; shift <= 5; shift++) {
    let cost = shift < 0 ? -shift + (shift < -5 ? 3 : 0) : shift > 0 ? 2 + shift : 0;
    let unplayable = 0;
    const bars = kept.map((bar) =>
      bar.map((c) => {
        const root = (c.root + shift + 120) % 12;
        const name = NAMES[root];
        const sharp = name === 'Db' ? 'C#' : name === 'Eb' ? 'D#' : name === 'Ab' ? 'G#' : name;
        let q = c.q;
        if (q === '7' && !DOM.has(name)) {
          q = 'maj';
          cost += 1;
        }
        const ok =
          q === 'min'
            ? MIN.has(sharp === 'Gb' ? 'F#' : sharp)
            : MAJ.has(name) || (q === '7' && DOM.has(name));
        if (!ok) unplayable++;
        const label =
          q === 'min'
            ? `${sharp === 'F#' || name === 'F#' ? 'F#' : name}m`
            : q === '7'
              ? `${name}7`
              : name;
        return label;
      }),
    );
    const score = unplayable * 100 + cost;
    if (!best || score < best.score) best = { shift, score, unplayable, bars };
  }
  if (best.unplayable > 0) {
    stats.unplayable++;
    continue;
  }
  stats.ok++;
  const info = index.get(id);
  // without the chart index there is no year, position, title or artist to trust
  if (!info || !info.title || !info.artist) {
    stats.noIndex++;
    continue;
  }
  out.push({
    id,
    title: fixTitle(info.title),
    artist: info.artist,
    year: info.year,
    peak: info.peak,
    beatsPerBar,
    steps,
    bpm: Math.round(bpm),
    capo: best.shift < 0 ? -best.shift : 0,
    up: best.shift > 0 ? best.shift : 0,
    tonic: head.tonic,
    bars: best.bars.map((b) => b.join(' ')),
  });
}
console.log(stats);
out.sort((a, b) => a.peak - b.peak || a.title.localeCompare(b.title));
// the same song can be on the chart in more than one week: keep one
const unique = [];
const names = new Set();
for (const song of out) {
  // "The Righteous Brothers" and "Righteous Brothers" are one act, as the app's song ids see them
  const key = `${song.title}|${song.artist.replace(/^the\s+/i, '')}`
    .toLowerCase()
    .replace(/[^a-z0-9|]/g, '');
  if (names.has(key)) continue;
  names.add(key);
  unique.push(song);
}
out.length = 0;
out.push(...unique);
console.log(
  out.length,
  'songs;',
  out
    .filter((s) => /beatles/i.test(s.artist))
    .map((s) => s.title)
    .join(' | '),
);
if (outFile) writeFileSync(outFile, JSON.stringify(out));

if (tsFile) {
  // every song that converts (Hot 100 peaks never go beyond 100, so there is nothing left to leave out)
  const chosen = out;
  const q = (x) => JSON.stringify(x);
  const rows = chosen.map(
    (s) =>
      `  { title: ${q(s.title)}, artist: ${q(s.artist)}, year: ${s.year}, peak: ${s.peak}, beatsPerBar: ${s.beatsPerBar}, steps: ${s.steps}, bpm: ${s.bpm}, capo: ${s.capo}, up: ${s.up}, bars: ${q(s.bars.join(' | '))} },`,
  );
  writeFileSync(
    tsFile,
    `// Generated by scripts/import-billboard.mjs from the McGill Billboard chord annotations (CC0). Do not edit.
// Each song is its title, artist, chart year and peak, tempo, meter, and the chords of its verses and
// choruses, one or two to a bar, simplified to chords Strumline has fingerings for. No melody, no lyrics.
import type { PopSong } from './pop';

export const POP_DATA: readonly PopSong[] = [
${rows.join('\n')}
];
`,
  );
  console.log('wrote', chosen.length, 'songs to', tsFile);
}
