import type { Chart } from '../chart';
import { grooveChart } from '../songs/notation';

/** The percussion profiles that have rhythm exercises. */
export const RHYTHM_EXERCISE_PROFILES = ['hand-percussion', 'drum-kit', 'clap'] as const;

interface Rudiment {
  id: string;
  title: string;
  bpm: number;
  /** Steps per beat: 2 is eighth notes, 3 is triplets. */
  stepsPerBeat: number;
  /** One phrase per lane (a bar of 4 beats, or two for a longer figure), repeated. */
  lanes: Readonly<Record<string, string>>;
}

/**
 * Rhythm practice: strokes written for the two hands as clap (right) and tap (left), basic drum
 * kit coordination, and rhythm figures for a single clap. One sound at a time, as everywhere.
 */
const RUDIMENTS: Readonly<Record<(typeof RHYTHM_EXERCISE_PROFILES)[number], readonly Rudiment[]>> =
  {
    'hand-percussion': [
      {
        id: 'single-strokes',
        title: 'Single strokes (R L R L)',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { clap: 'x.x.x.x.', tap: '.x.x.x.x' },
      },
      {
        id: 'double-strokes',
        title: 'Double strokes (RR LL)',
        bpm: 64,
        stepsPerBeat: 2,
        lanes: { clap: 'xx..xx..', tap: '..xx..xx' },
      },
      {
        id: 'paradiddle',
        title: 'Paradiddle (R L R R, L R L L)',
        bpm: 64,
        stepsPerBeat: 2,
        lanes: { clap: 'x.xx.x..', tap: '.x..x.xx' },
      },
      {
        id: 'triplets',
        title: 'Triplets (R L R, L R L)',
        bpm: 60,
        stepsPerBeat: 3,
        lanes: { clap: 'x.x.x.x.x.x.', tap: '.x.x.x.x.x.x' },
      },
      {
        id: 'paradiddle-diddle',
        title: 'Paradiddle-diddle (R L R R L L)',
        bpm: 60,
        stepsPerBeat: 2,
        lanes: { clap: 'x.xx..', tap: '.x..xx' },
      },
    ],
    'drum-kit': [
      {
        id: 'kick-snare',
        title: 'Kick and snare, taking turns',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { kick: 'x...x...', snare: '..x...x.' },
      },
      {
        id: 'four-on-the-floor',
        title: 'Kick on every beat',
        bpm: 80,
        stepsPerBeat: 2,
        lanes: { kick: 'x.x.x.x.' },
      },
      {
        id: 'hat-eighths',
        title: 'Hat eighths with a kick and a snare',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { kick: 'x.......', snare: '....x...', hat: '.xxx.xxx' },
      },
      {
        id: 'snare-roll',
        title: 'Snare roll (steady eighths)',
        bpm: 70,
        stepsPerBeat: 2,
        lanes: { snare: 'xxxxxxxx' },
      },
      {
        id: 'boom-boom-clap',
        title: 'Boom boom clap (two kicks, then the snare)',
        bpm: 76,
        stepsPerBeat: 2,
        lanes: { kick: 'x.x.....', snare: '....x...' },
      },
      {
        id: 'disco',
        title: 'Disco: kick on the beat, hat between',
        bpm: 76,
        stepsPerBeat: 2,
        lanes: { kick: 'x.x.x.x.', hat: '.x.x.x.x' },
      },
      {
        id: 'snare-triplets',
        title: 'Snare triplets',
        bpm: 56,
        stepsPerBeat: 3,
        lanes: { snare: 'xxxxxxxxxxxx' },
      },
    ],
    clap: [
      {
        id: 'quarters',
        title: 'Steady quarter notes',
        bpm: 80,
        stepsPerBeat: 2,
        lanes: { hit: 'x.x.x.x.' },
      },
      {
        id: 'eighths',
        title: 'Steady eighth notes',
        bpm: 66,
        stepsPerBeat: 2,
        lanes: { hit: 'xxxxxxxx' },
      },
      {
        id: 'gallop',
        title: 'Gallop (long, short, short)',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { hit: 'x.xxx.xx' },
      },
      {
        id: 'off-beats',
        title: 'Off-beats (clap between the beats)',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { hit: '.x.x.x.x' },
      },
      {
        id: 'syncopation',
        title: 'Syncopation',
        bpm: 72,
        stepsPerBeat: 2,
        lanes: { hit: 'x..x..x.' },
      },
      {
        id: 'triplets',
        title: 'Triplets',
        bpm: 60,
        stepsPerBeat: 3,
        lanes: { hit: 'xxxxxxxxxxxx' },
      },
      {
        id: 'tresillo',
        title: 'Tresillo (3 + 3 + 2)',
        bpm: 76,
        stepsPerBeat: 2,
        lanes: { hit: 'x..x..x.' },
      },
      {
        id: 'son-clave',
        title: 'Son clave (3-2)',
        bpm: 84,
        stepsPerBeat: 2,
        lanes: { hit: 'x..x..x...x.x...' },
      },
    ],
  };

const BARS = 6;

/** The rhythm exercises for a percussion profile, keyed by song id (`ex-<profile>-<id>`). */
export function rhythmExercises(profileId: string): Record<string, Chart> {
  const list = (RUDIMENTS as Record<string, readonly Rudiment[] | undefined>)[profileId];
  if (!list) return {};
  return Object.fromEntries(
    list.map((r) => [
      `ex-${profileId}-${r.id}`,
      grooveChart(
        { title: r.title, artist: 'Lineup', bpm: r.bpm, instruments: [profileId] },
        Object.fromEntries(
          Object.entries(r.lanes).map(([lane, pattern]) => [lane, pattern.repeat(BARS)]),
        ),
        r.stepsPerBeat,
      ),
    ]),
  );
}
