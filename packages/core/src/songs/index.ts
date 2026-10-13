import { loadChart, type Chart } from '../chart';
import { chordChangeDrills, exerciseCharts } from '../generate/exercises';
import { generateChordSong, parseChordSongId } from '../generate/chordsong';
import { generateFluteSong, parseFluteId } from '../generate/flute';
import { generateGroove, parseGrooveId } from '../generate/groove';
import { generateMelody, parseMelodyId } from '../generate/melody';
import { rhythmExercises } from '../generate/rudiments';
import { FLUTE_SONGS, LIBRARY } from './library';
import clapBasic from './clap-basic.json';
import clapTapGroove from './clap-tap-groove.json';
import drumRock from './drum-rock.json';
import singlineDemo from './singline-demo.json';
import strumFolk from './strum-folk.json';
import strumFourChords from './strum-four-chords.json';
import strumPicking from './strum-picking.json';
import singlineScale from './singline-scale.json';
import ukuleleNotesDemo from './ukulele-notes-demo.json';
import ukuleleStrumDemo from './ukulele-strum-demo.json';
import windGreensleeves from './wind-greensleeves.json';
import windOde from './wind-ode.json';
import windScale from './wind-scale.json';
import windTwinkle from './wind-twinkle.json';

const RAW: Record<string, unknown> = {
  'ukulele-strum-demo': ukuleleStrumDemo,
  'ukulele-notes-demo': ukuleleNotesDemo,
  'strum-four-chords': strumFourChords,
  'strum-folk': strumFolk,
  'strum-picking': strumPicking,
  'singline-demo': singlineDemo,
  'singline-scale': singlineScale,
  'wind-scale': windScale,
  'wind-twinkle': windTwinkle,
  'wind-ode': windOde,
  'wind-greensleeves': windGreensleeves,
  'clap-basic': clapBasic,
  'clap-tap-groove': clapTapGroove,
  'drum-rock': drumRock,
};

/**
 * Practice material built from small descriptions (scales, patterns...), as opposed to the
 * hand-written songs above. Charts from the generators are validated as they are built.
 */
const EXERCISES: Record<string, Chart> = {
  ...exerciseCharts('voice'),
  ...exerciseCharts('wind'),
  ...exerciseCharts('ukulele-strum'),
  ...chordChangeDrills(),
  ...rhythmExercises('hand-percussion'),
  ...rhythmExercises('drum-kit'),
  ...rhythmExercises('clap'),
};

/** Built-in songs, validated when this module loads (a bad one fails every test). */
export const builtinSongs: Readonly<Record<string, Chart>> = {
  ...Object.fromEntries(
    Object.entries(RAW).map(([id, raw]) => {
      const r = loadChart(raw);
      if (!r.ok) throw new Error(`built-in song "${id}" is invalid:\n${r.errors.join('\n')}`);
      return [id, r.value] as const;
    }),
  ),
  ...LIBRARY,
  ...FLUTE_SONGS,
  ...EXERCISES,
};

/** What a menu entry is: a song, practice material such as a scale, or a song for the pentatonic flutes. */
export type SongCategory = 'song' | 'exercise' | 'flute';

/** Whether a built-in id is practice material (an exercise) or a song. */
export const songCategory = (id: string): SongCategory =>
  Object.hasOwn(EXERCISES, id)
    ? 'exercise'
    : Object.hasOwn(FLUTE_SONGS, id) || parseFluteId(id) !== null
      ? 'flute'
      : 'song';

/** A built-in song, or a generated melody named by its id (`gen-<profile>-<scale>-<level>-<seed>`). */
export function getSong(id: string): Chart {
  const generated = parseMelodyId(id);
  if (generated) return generateMelody(generated.profileId, generated.spec);
  const chords = parseChordSongId(id);
  if (chords) return generateChordSong(chords);
  const flute = parseFluteId(id);
  if (flute) return generateFluteSong(flute);
  const groove = parseGrooveId(id);
  if (groove) return generateGroove(groove.profile, groove.spec);
  const c = Object.hasOwn(builtinSongs, id) ? builtinSongs[id] : undefined;
  if (!c) throw new Error(`unknown song "${id}" (have: ${Object.keys(builtinSongs).join(', ')})`);
  return c;
}

/** Built-in songs meant for a profile, in menu order. */
export function songsFor(
  profileId: string,
): { id: string; chart: Chart; category: SongCategory }[] {
  return Object.entries(builtinSongs)
    .filter(([, chart]) => chart.meta.instruments?.includes(profileId))
    .map(([id, chart]) => ({ id, chart, category: songCategory(id) }));
}

export { FLUTE_SONGS, LIBRARY } from './library';
export * from './notation';
