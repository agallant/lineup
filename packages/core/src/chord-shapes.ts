import {
  chordPitchClasses,
  canonicalChordName,
  parseChordName,
  type ParsedChord,
} from './chord-theory';

/** The ukulele's open strings (G C E A), as MIDI notes, in the order its chord fingerings use. */
export const UKULELE_OPEN = [67, 60, 64, 69] as const;

/** One way to finger a chord: the fret to hold on each string (null is a muted string). */
export interface Voicing {
  frets: readonly (number | null)[];
  /** Where on the neck the shape sits: 0 for open position (any open string), else the lowest fret held. */
  position: number;
  /** How many fingers it takes (a barre across several strings counts as one). */
  fingers: number;
  /** True when one finger lies across two or more strings. */
  barre: boolean;
  /** How hard it is to play: lower is easier. */
  cost: number;
}

const GUITAR_STANDARD_OPEN = [40, 45, 50, 55, 59, 64];

/**
 * The shapes that slide up the neck: frets relative to the barre fret, and the string the root is
 * on (0 is the low E). The E form has its root on the low E string, the A form on the A string.
 */
export const GUITAR_BARRE_FORMS: Readonly<
  Record<string, readonly { string: number; rel: (number | null)[] }[]>
> = {
  '': [
    { string: 0, rel: [0, 2, 2, 1, 0, 0] },
    { string: 1, rel: [null, 0, 2, 2, 2, 0] },
  ],
  m: [
    { string: 0, rel: [0, 2, 2, 0, 0, 0] },
    { string: 1, rel: [null, 0, 2, 2, 1, 0] },
  ],
  '7': [
    { string: 0, rel: [0, 2, 0, 1, 0, 0] },
    { string: 1, rel: [null, 0, 2, 0, 2, 0] },
  ],
  maj7: [
    { string: 0, rel: [0, 2, 1, 1, 0, 0] },
    { string: 1, rel: [null, 0, 2, 1, 2, 0] },
  ],
  m7: [
    { string: 0, rel: [0, 2, 0, 0, 0, 0] },
    { string: 1, rel: [null, 0, 2, 0, 1, 0] },
  ],
  sus4: [
    { string: 0, rel: [0, 2, 2, 2, 0, 0] },
    { string: 1, rel: [null, 0, 2, 2, 3, 0] },
  ],
  sus2: [{ string: 1, rel: [null, 0, 2, 2, 0, 0] }],
  '6': [
    { string: 0, rel: [0, 2, 2, 1, 2, 0] },
    { string: 1, rel: [null, 0, 2, 2, 2, 2] },
  ],
  m7b5: [{ string: 1, rel: [null, 0, 1, 0, 1, null] }],
  dim: [{ string: 1, rel: [null, 0, 1, 2, 1, null] }],
  '5': [
    { string: 0, rel: [0, 2, 2, null, null, null] },
    { string: 1, rel: [null, 0, 2, 2, null, null] },
  ],
};

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
/** The highest fret a generated fingering reaches. */
const MAX_FRET = 14;
/** The widest stretch of frets a hand covers. */
const SPAN = 3;

/** The fingers a fingering takes, whether it has a barre, and the lowest fretted fret. */
function hand(frets: readonly (number | null)[]): { fingers: number; barre: boolean; low: number } {
  const held = frets.flatMap((f, i) => (f !== null && f > 0 ? [{ f, i }] : []));
  if (held.length === 0) return { fingers: 0, barre: false, low: 0 };
  const low = Math.min(...held.map((h) => h.f));
  const at = held.filter((h) => h.f === low).map((h) => h.i);
  let barre = false;
  if (at.length >= 2) {
    const [first, last] = [at[0]!, at[at.length - 1]!];
    // a barre needs every string between its ends held at or above it (none open or muted)
    barre = frets.slice(first, last + 1).every((f) => f !== null && f >= low);
  }
  const fingers = barre ? 1 + held.filter((h) => h.f > low).length : held.length;
  return { fingers, barre, low };
}

/** The notes (pitch classes) a fingering of this chord has to contain. */
function required(chord: ParsedChord): Set<number> {
  const need = new Set(chordPitchClasses(chord));
  if (chord.quality.looseFifth) need.delete(mod12(chord.root + 7));
  return need;
}

/** Every playable fingering of a chord on strings tuned `open` (low to high), easiest first. */
function search(
  open: readonly number[],
  chord: ParsedChord,
  mutes: boolean,
  strictBass = mutes,
): Voicing[] {
  const need = required(chord);
  const bass = chord.bass ?? chord.root;
  // a guitar's lowest string sounds the bass; a ukulele's strings are not in pitch order, so its bass counts only when asked
  const bassMatters = strictBass;
  // a power chord has two notes but is played with the root doubled
  const minNotes = mutes ? 3 : open.length;
  const all = new Set(chordPitchClasses(chord));
  const found = new Map<string, Voicing>();
  const frets: (number | null)[] = [];

  /** Adds a fingering to the results when it is playable, with `bonus` taken off its cost. */
  const consider = (frets: readonly (number | null)[], bonus: number): void => {
    const sounding = frets.flatMap((f, s) => (f === null ? [] : [open[s]! + f]));
    if (sounding.length < minNotes) return;
    const classes = new Set(sounding.map(mod12));
    for (const n of need) if (!classes.has(n)) return;
    for (const c of classes) if (!all.has(c)) return;
    if (bassMatters && mod12(Math.min(...sounding)) !== bass) return;
    // sounding strings run unbroken, give or take one muted string inside
    const idx = frets.flatMap((f, s) => (f === null ? [] : [s]));
    const inner = idx[idx.length - 1]! - idx[0]! + 1 - idx.length;
    if (inner > 1) return;
    const { fingers, barre, low } = hand(frets);
    if (fingers > 4) return;
    const muted = open.length - sounding.length;
    const fretted = frets.filter((f): f is number => f !== null && f > 0);
    const stretch = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const thin = mutes && minNotes >= 3 ? Math.max(0, 4 - sounding.length) : 0;
    // open strings are easy low on the neck but a nuisance high up
    const opens = low >= 2 ? frets.filter((f) => f === 0).length : 0;
    const cost =
      fingers * 3 +
      low * 2.5 +
      inner * 8 +
      muted * 3 +
      (barre ? 2 : 0) +
      stretch * stretch * 1.5 +
      opens * 4 +
      thin * 6 -
      bonus;
    const key = frets.join(',');
    const seen = found.get(key);
    if (!seen || cost < seen.cost)
      found.set(key, {
        frets: [...frets],
        position: frets.includes(0) ? 0 : low,
        fingers,
        barre,
        cost,
      });
  };

  const visit = (i: number, window: number): void => {
    if (i === open.length) {
      consider(frets, 0);
      return;
    }
    const options: (number | null)[] = mutes ? [null] : [];
    // only frets that sound a note of the chord
    const fits = (f: number): boolean => all.has(mod12(open[i]! + f));
    if (fits(0)) options.push(0);
    for (let f = Math.max(1, window); f <= Math.min(MAX_FRET, window + SPAN); f++) {
      if (fits(f)) options.push(f);
    }
    for (const f of options) {
      frets[i] = f;
      visit(i + 1, window);
    }
    frets.length = i;
  };
  for (let window = 0; window <= MAX_FRET - SPAN; window++) visit(0, window);
  // the movable barre shapes guitarists know (the E and A forms) are favoured where they fit
  if (mutes && open.length === 6 && open.every((o, i) => o === GUITAR_STANDARD_OPEN[i])) {
    for (const t of GUITAR_BARRE_FORMS[chord.quality.id] ?? []) {
      const base = mod12(chord.root - open[t.string]!);
      for (const b of base === 0 ? [0, 12] : [base]) {
        const shape = t.rel.map((r) => (r === null ? null : r + b));
        if (shape.every((f) => f === null || f <= MAX_FRET)) consider(shape, 3);
      }
    }
  }
  return [...found.values()].sort((a, b) => a.cost - b.cost || a.position - b.position);
}

/** A fingering (frets per string) described as a voicing: where it sits, its fingers and any barre. */
export function describeFingering(frets: readonly (number | null)[]): Voicing {
  const { fingers, barre, low } = hand(frets);
  return { frets, position: frets.includes(0) ? 0 : low, fingers, barre, cost: 0 };
}

const cache = new Map<string, Voicing[]>();

/**
 * Fingerings for a chord on a stringed instrument, easiest first: `open` is the strings low to high
 * (a guitar), or the ukulele's in its own order with `mutes` false. Empty for an unknown chord name.
 */
export function chordVoicings(
  open: readonly number[],
  name: string,
  mutes: boolean,
): readonly Voicing[] {
  const chord = parseChordName(name);
  if (!chord) return [];
  const key = `${open.join('.')}|${mutes}|${canonicalChordName(name)}`;
  let all = cache.get(key);
  if (!all) {
    if (
      !mutes &&
      chord.bass !== null &&
      chordPitchClasses({ ...chord, bass: null }).includes(chord.bass)
    ) {
      // a ukulele's slash chord has the named bass lowest when that is easy to finger (C/E is 0 4 3 3);
      // its strings are not in pitch order, so otherwise (and for a bass outside the chord, like C/D)
      // it is just the chord
      const strict = search(open, chord, mutes, true).filter(
        (v) => Math.max(...v.frets.map((f) => f ?? 0)) <= 4,
      );
      all = strict.length > 0 ? strict : search(open, { ...chord, bass: null }, mutes);
    } else {
      // (a ukulele's bass outside the chord is dropped: C/D is C)
      all = search(open, !mutes ? { ...chord, bass: null } : chord, mutes);
    }
    cache.set(key, all);
  }
  return all;
}

/**
 * The same chord in a few places on the neck: the easiest fingering at each position, lowest
 * first. This is the movable-shape view of a chord: the same notes, higher up, on other strings.
 */
export function chordPositions(
  open: readonly number[],
  name: string,
  mutes: boolean,
  limit = 6,
): Voicing[] {
  const best = new Map<number, Voicing>();
  for (const v of chordVoicings(open, name, mutes)) {
    const key = Math.floor(v.position / 2);
    if (!best.has(key)) best.set(key, v);
  }
  return [...best.values()].sort((a, b) => a.position - b.position).slice(0, limit);
}
