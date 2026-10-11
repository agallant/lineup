/** One lesson of a learning path: a song or exercise from the library. */
export interface CourseStep {
  songId: string;
  /** What this step teaches, in a few words. */
  focus: string;
}

/** A learning path for one instrument: steps in order, each unlocked by finishing the one before. */
export interface Course {
  id: string;
  title: string;
  /** The game's route ("sing") and instrument profile id for score lookups. */
  route: string;
  profileId: string;
  /** Beatline only: which sound set (profile) the steps use. */
  mode?: string;
  blurb: string;
  steps: readonly CourseStep[];
}

export const COURSES: readonly Course[] = [
  {
    id: 'voice-first-steps',
    title: 'Singline: first steps',
    route: 'sing',
    profileId: 'voice',
    blurb: 'From a three-note tune to a song with leaps and a long melody.',
    steps: [
      { songId: 'sing-hot-cross-buns', focus: 'Three notes, steady beat' },
      { songId: 'sing-mary-lamb', focus: 'Step by step down and up' },
      { songId: 'ex-voice-major-up-down', focus: 'The whole major scale' },
      { songId: 'sing-row-boat', focus: 'Faster notes' },
      { songId: 'sing-frere-jacques', focus: 'A round, with a small leap' },
      { songId: 'ex-voice-major-thirds', focus: 'Skipping a note' },
      { songId: 'sing-ode-to-joy', focus: 'A famous tune' },
      { songId: 'ex-voice-major-fifths', focus: 'Bigger leaps' },
      { songId: 'sing-silent-night', focus: 'A long, slow melody in three' },
      { songId: 'sing-amazing-grace', focus: 'Reaching below the key note' },
      { songId: 'sing-fur-elise', focus: 'Sharps and flats' },
    ],
  },
  {
    id: 'wind-first-steps',
    title: 'Windline: first steps',
    route: 'wind',
    profileId: 'wind',
    blurb: 'Fingerings from the first notes to a whole scale and a few tunes.',
    steps: [
      { songId: 'wind-hot-cross-buns', focus: 'Three notes: B, A, G' },
      { songId: 'wind-mary-lamb', focus: 'Moving between neighbours' },
      { songId: 'ex-wind-major-up-down', focus: 'The whole scale' },
      { songId: 'wind-row-boat', focus: 'Quicker notes' },
      { songId: 'ex-wind-major-thirds', focus: 'Skipping a note' },
      { songId: 'wind-ode-to-joy', focus: 'A famous tune' },
      { songId: 'wind-silent-night', focus: 'Reaching the high notes' },
      { songId: 'ex-wind-major-arpeggios', focus: 'Leaping around the chord' },
    ],
  },
  {
    id: 'ukulele-chords',
    title: 'Strumline: your first chords',
    route: 'strum',
    profileId: 'ukulele-strum',
    blurb: 'Change between chords, then strum songs that use them.',
    steps: [
      { songId: 'ex-ukulele-strum-changes-c-am', focus: 'C and Am: the easiest change' },
      { songId: 'strum-fifties', focus: 'C Am F G' },
      { songId: 'ex-ukulele-strum-changes-c-f', focus: 'C and F' },
      { songId: 'strum-skip-lou', focus: 'C and G7, with up-strokes' },
      { songId: 'ex-ukulele-strum-changes-g-d', focus: 'G and D' },
      { songId: 'strum-blues', focus: 'The twelve-bar blues' },
      { songId: 'strum-waltz', focus: 'Three beats to the bar' },
      { songId: 'strum-minor', focus: 'Minor chords' },
      { songId: 'strum-rising-sun', focus: 'A folk classic with an E' },
    ],
  },
  {
    id: 'clap-rhythm',
    title: 'Beatline: find the beat',
    route: 'beat',
    profileId: 'clap',
    mode: 'clap',
    blurb: 'Clap along from steady beats to syncopation and Latin patterns.',
    steps: [
      { songId: 'ex-clap-quarters', focus: 'Steady quarter notes' },
      { songId: 'ex-clap-eighths', focus: 'Twice as fast' },
      { songId: 'ex-clap-off-beats', focus: 'Between the beats' },
      { songId: 'ex-clap-gallop', focus: 'Long, short, short' },
      { songId: 'ex-clap-syncopation', focus: 'Off the beat' },
      { songId: 'clap-waltz', focus: 'Three beats to the bar' },
      { songId: 'ex-clap-tresillo', focus: '3 + 3 + 2' },
      { songId: 'ex-clap-triplets', focus: 'Three to a beat' },
      { songId: 'ex-clap-son-clave', focus: 'Son clave' },
    ],
  },
  {
    id: 'kit-groove',
    title: 'Beatline: drum kit grooves',
    route: 'beat',
    profileId: 'drum-kit',
    mode: 'drum-kit',
    blurb: 'Kick, snare and hat: from two drums to a funk groove.',
    steps: [
      { songId: 'ex-drum-kit-kick-snare', focus: 'Kick and snare taking turns' },
      { songId: 'ex-drum-kit-four-on-the-floor', focus: 'Kick on every beat' },
      { songId: 'ex-drum-kit-hat-eighths', focus: 'Adding the hat' },
      { songId: 'ex-drum-kit-boom-boom-clap', focus: 'Two kicks, then the snare' },
      { songId: 'kit-disco', focus: 'A disco beat' },
      { songId: 'kit-halftime', focus: 'Half-time groove' },
      { songId: 'kit-rock-fill', focus: 'A rock beat with a fill' },
      { songId: 'kit-funk', focus: 'Funk, two bars' },
    ],
  },
  {
    id: 'voice-scales-and-keys',
    title: 'Singline: scales and modes',
    route: 'sing',
    profileId: 'voice',
    blurb: 'Beyond major: pentatonic, minor and the modes, then every semitone.',
    steps: [
      { songId: 'ex-voice-major-pentatonic-up-down', focus: 'Five notes that always sound good' },
      { songId: 'ex-voice-minor-pentatonic-up-down', focus: 'The bluesy five' },
      { songId: 'ex-voice-minor-up-down', focus: 'The natural minor scale' },
      { songId: 'ex-voice-minor-thirds', focus: 'Minor, skipping a note' },
      { songId: 'ex-voice-dorian-up-down', focus: 'Minor with a brighter sixth' },
      { songId: 'ex-voice-mixolydian-up-down', focus: 'Major with a flat seventh' },
      { songId: 'ex-voice-minor-fifths', focus: 'Minor, bigger leaps' },
      { songId: 'ex-voice-chromatic-up-down', focus: 'Every semitone' },
    ],
  },
  {
    id: 'wind-scales-and-keys',
    title: 'Windline: scales and modes',
    route: 'wind',
    profileId: 'wind',
    blurb: 'Beyond major: pentatonic, minor and the modes, then every semitone.',
    steps: [
      { songId: 'ex-wind-major-pentatonic-up-down', focus: 'Five notes that always sound good' },
      { songId: 'ex-wind-minor-pentatonic-up-down', focus: 'The bluesy five' },
      { songId: 'ex-wind-minor-up-down', focus: 'The natural minor scale' },
      { songId: 'ex-wind-minor-thirds', focus: 'Minor, skipping a note' },
      { songId: 'ex-wind-dorian-up-down', focus: 'Minor with a brighter sixth' },
      { songId: 'ex-wind-mixolydian-up-down', focus: 'Major with a flat seventh' },
      { songId: 'ex-wind-minor-fifths', focus: 'Minor, bigger leaps' },
      { songId: 'ex-wind-chromatic-up-down', focus: 'Every semitone' },
    ],
  },
];

/** Stars needed on a step to open the next one, and to count it as mastered. */
export const OPEN_NEXT_STARS = 1;
export const MASTERED_STARS = 2;

export type StepState = 'locked' | 'open' | 'cleared' | 'mastered';

export interface StepProgress extends CourseStep {
  state: StepState;
  /** Most stars earned on it, or null if never played. */
  stars: number | null;
}

/**
 * Where a player is on a course. `starsOf` gives the most stars earned on a song id (null if never
 * played). A step opens when the one before has OPEN_NEXT_STARS or more; the first is always open.
 */
export function courseProgress(
  course: Course,
  starsOf: (songId: string) => number | null,
): { steps: StepProgress[]; mastered: number; done: boolean } {
  const steps: StepProgress[] = [];
  let unlocked = true;
  for (const step of course.steps) {
    const stars = starsOf(step.songId);
    const state: StepState = !unlocked
      ? 'locked'
      : stars !== null && stars >= MASTERED_STARS
        ? 'mastered'
        : stars !== null && stars >= OPEN_NEXT_STARS
          ? 'cleared'
          : 'open';
    steps.push({ ...step, state, stars });
    unlocked = unlocked && stars !== null && stars >= OPEN_NEXT_STARS;
  }
  const mastered = steps.filter((s) => s.state === 'mastered').length;
  return { steps, mastered, done: mastered === steps.length };
}

/** The route that opens a step's game with its song chosen. */
export function stepHref(course: Course, step: CourseStep): string {
  const params = [`song=${encodeURIComponent(step.songId)}`];
  if (course.mode) params.push(`mode=${encodeURIComponent(course.mode)}`);
  return `#/${course.route}?${params.join('&')}`;
}

/** The value of a query parameter in a hash route ("#/sing?song=x"), or null. */
export function hashParam(hash: string, name: string): string | null {
  const query = hash.split('?')[1];
  if (!query) return null;
  for (const pair of query.split('&')) {
    const [k, v] = pair.split('=');
    if (k === name && v !== undefined) {
      try {
        return decodeURIComponent(v);
      } catch {
        return null;
      }
    }
  }
  return null;
}
