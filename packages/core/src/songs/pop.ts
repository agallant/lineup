import type { Chart } from '../chart';
import { chartFromBeats, type BeatNote } from '../chart';
import { UKULELE_CHORD_FRETS } from '../chords';
import { POP_DATA } from './pop-data';

/**
 * One well-known song as its chords: where it sat on the chart, how fast it goes, and a chord (or two,
 * for a bar that changes halfway) per bar. The chords are a simplified, playable version of the
 * recording's: sevenths, suspensions and inversions become plain chords unless a dominant seventh has a
 * fingering, and the song is moved down (`capo` frets) or up (`up` semitones) into a key whose chords
 * the ukulele and guitar tables have. Chord sequences are facts about a song; there is no melody or text.
 */
export interface PopSong {
  title: string;
  artist: string;
  /** The year it was on the Billboard Hot 100. */
  year: number;
  /** Its highest chart position. */
  peak: number;
  beatsPerBar: number;
  /** Strum steps to a beat: 2 for eighths, 3 for the triplet feel of 6/8, 9/8 and 12/8. */
  steps: number;
  bpm: number;
  /** Capo fret that puts these chords back in the recorded key (0 when none is needed). */
  capo: number;
  /** Semitones the song was moved up to reach playable chords (0 when it was not). */
  up: number;
  /** The bars, separated by `|`; a bar with two chords changes halfway. */
  bars: string;
}

/** One bar of strumming for a meter and tempo: slower songs get the busier pattern. */
export function popPattern(beatsPerBar: number, steps: number, bpm: number): string {
  if (steps === 3) {
    // compound time: a pulse on each beat with the second and third subdivisions lighter
    const beat = bpm > 110 ? 'D . .' : 'D . U';
    return Array.from({ length: beatsPerBar }, () => beat).join(' ');
  }
  const barSeconds = (beatsPerBar * 60) / bpm;
  const busy = barSeconds >= 2.2;
  if (beatsPerBar === 4)
    return busy ? 'D . D U . U D U' : bpm >= 125 ? 'D . D . D . D .' : 'D . D U D . D U';
  if (beatsPerBar === 3) return busy ? 'D . D U D U' : 'D . D . D .';
  return busy ? 'D . D U' : 'D . D .';
}

/** The identifier of a song in the library. */
export function popId(song: Pick<PopSong, 'title' | 'artist'>): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `pop-${slug(song.artist.replace(/^the /i, ''))}-${slug(song.title)}`.slice(0, 80);
}

/** The strum chart of a song: its chords, strummed in a pattern to suit its meter and tempo. */
export function popChart(song: PopSong): Chart {
  const pattern = [...popPattern(song.beatsPerBar, song.steps, song.bpm).replace(/\s+/g, '')];
  const stepsPerBar = song.beatsPerBar * song.steps;
  const notes: BeatNote[] = [];
  song.bars.split('|').forEach((bar, i) => {
    const chords = bar.trim().split(/\s+/);
    for (const chord of chords) {
      if (!UKULELE_CHORD_FRETS[chord])
        throw new Error(`${song.title}: no fingering for "${chord}"`);
    }
    pattern.forEach((step, k) => {
      if (step === '.') return;
      const chord = chords[Math.floor((k * chords.length) / stepsPerBar)]!;
      const direction = step === 'D' ? 'down' : 'up';
      notes.push({
        beat: i * song.beatsPerBar + k / song.steps,
        lane: direction,
        expected: { chord, direction },
      });
    });
  });
  const how =
    song.capo > 0
      ? ` · capo ${song.capo} for the recorded key`
      : song.up > 0
        ? ` · moved up ${song.up}`
        : '';
  return chartFromBeats(
    {
      title: song.title,
      artist: `${song.artist}${how}`,
      bpm: song.bpm,
      instruments: ['ukulele-strum'],
      ...(song.beatsPerBar === 4 ? {} : { beatsPerBar: song.beatsPerBar }),
    },
    notes,
  );
}

/** Every song in the table as a chart, by identifier. */
export const POP_SONGS: Readonly<Record<string, Chart>> = Object.fromEntries(
  POP_DATA.map((s) => [popId(s), popChart(s)]),
);

/** The songs that reached the top three, for a pack of the best known. */
export const POP_FAVORITES: ReadonlySet<string> = new Set(
  POP_DATA.filter((s) => s.peak <= 3).map(popId),
);
