import {
  DEFAULT_WIND_INSTRUMENT,
  findWindInstrument,
  isDifficulty,
  isMelodyLevel,
  isVariation,
  isScaleId,
  isSeed,
  type Difficulty,
  type KeyValueStore,
  type MelodySpec,
  type Variation,
} from '@lineup/core';
import { isVoiceChoice } from './voice-range';

/** How much backing music plays under a song. */
export type Accompaniment = 'off' | 'bass' | 'full';

import { DRONES, type Drone } from './game/backing';
import { DRUM_STYLES, type DrumStyle } from './game/drums';

export const ACCOMPANIMENTS: readonly Accompaniment[] = ['off', 'bass', 'full'];

/** Weekly practice goals offered, in minutes (0 for none). */
export const GOAL_MINUTES: readonly number[] = [0, 15, 30, 60, 120];

export type Theme = 'dark' | 'light' | 'contrast';
export const THEMES: readonly Theme[] = ['dark', 'light', 'contrast'];

export type TextSize = 'normal' | 'large' | 'larger';
export const TEXT_SIZES: readonly TextSize[] = ['normal', 'large', 'larger'];

/** The practice speeds on offer, slowest first. */
export const SPEEDS: readonly number[] = [0.5, 0.65, 0.8, 1];

/** The next speed up from `speed`, or null at the top. */
export function nextSpeed(speed: number): number | null {
  return SPEEDS.find((s) => s > speed + 1e-9) ?? null;
}

export interface Settings {
  /** Show the live debug overlay while playing. */
  debug: boolean;
  /** Play the target pitch as a quiet tone (needs headphones). */
  guideTone: boolean;
  /** Play a click on every beat. */
  metronome: boolean;
  /** Singline and Windline: hear the song played first, then play it back. */
  listenFirst: boolean;
  /** Beatline, with listen first: hide the notes on your turn, so you clap back from memory. */
  blind: boolean;
  /** Minutes of practice to aim for each week (0 for no goal). */
  goalMinutes: number;
  /** How large the page's text is. */
  textSize: TextSize;
  /** Whether the how-to-play page has been opened (the home menu stops suggesting it). */
  seenHelp: boolean;
  /** The colour scheme: dark, light or high contrast. */
  theme: Theme;
  /** A short jingle on a new best, a trophy, a level up or a cleared daily challenge. */
  effects: boolean;
  /** Play-along backing under a song: nothing, a bass line, or bass and chords (needs headphones). */
  accompaniment: Accompaniment;
  /** A quiet drum loop under Singline, Windline and Strumline songs (needs headphones). */
  drums: DrumStyle;
  /** Windline: a held tone under the song, the way a pentatonic flute is played (needs headphones). */
  drone: Drone;
  /** Key change in semitones applied to the chart. */
  keyShift: number;
  /** Key change per profile (an instrument's key is not a singer's); wins over `keyShift`. */
  keyShifts: Record<string, number>;
  /** How forgiving sustained-pitch scoring is (Singline). */
  difficulty: Difficulty;
  /** Windline: which instrument you play (decides the key the song is moved into and the fingerings). */
  windInstrument: string;
  /**
   * Windline: "auto" counts the right note in whatever octave you play it (a low whistle, an alto
   * recorder or a second octave all work); "exact" wants the octave the chart shows.
   */
  windOctave: 'auto' | 'exact';
  /** Windline: show the fingering of the current and next note while playing. */
  showFingerings: boolean;
  /** Strumline: also check that the right chord is strummed (experimental), not just the timing. */
  checkChords: boolean;
  /** Strumline: also check the pitch of each plucked note (experimental), not just the timing. */
  checkPitch: boolean;
  /** Singline: the voice type that songs are checked against ('any' for no preference). */
  voiceRange: string;
  /** Singline and Windline: two players take turns, phrase by phrase, with a score each. */
  duet: boolean;
  /** Strumline: tempo multiplier for practice (1 = the song's own tempo). */
  speed: number;
  /** Last chosen song id per profile. */
  songs: Record<string, string>;
  /** The random melody on offer in the song menu (Singline and Windline). */
  challenge: MelodySpec;
  /** Play songs as written, or a plainer or busier version of them. */
  variation: Variation;
  /** The difficulty (1 to 10) that "New song" aims for, or null for any. */
  target: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  debug: false,
  guideTone: true,
  metronome: true,
  effects: true,
  listenFirst: false,
  blind: false,
  goalMinutes: 0,
  textSize: 'normal',
  theme: 'dark',
  seenHelp: false,
  accompaniment: 'off',
  drums: 'off',
  drone: 'off',
  keyShift: 0,
  keyShifts: {},
  difficulty: 'normal',
  windInstrument: DEFAULT_WIND_INSTRUMENT,
  windOctave: 'auto',
  showFingerings: true,
  checkChords: false,
  checkPitch: false,
  voiceRange: 'any',
  duet: false,
  speed: 1,
  songs: {},
  challenge: { seed: 1, scale: 'major', level: 'easy' },
  variation: 'original',
  target: null,
};

const KEY = 'lineup.settings.v1';

/** Settings persisted in a key-value store, tolerant of missing, blocked or corrupt storage. */
export class SettingsStore {
  private value: Settings;

  constructor(private readonly store: KeyValueStore | null) {
    this.value = this.read();
  }

  get(): Settings {
    return {
      ...this.value,
      songs: { ...this.value.songs },
      keyShifts: { ...this.value.keyShifts },
      challenge: { ...this.value.challenge },
    };
  }

  /** Reads settings again from storage (after a backup was restored behind this store's back). */
  reload(): Settings {
    this.value = this.read();
    return this.get();
  }

  update(patch: Partial<Settings>): Settings {
    this.value = sanitize({ ...this.value, ...patch });
    try {
      this.store?.setItem(KEY, JSON.stringify(this.value));
    } catch {
      // private window / quota: keep working in memory
    }
    return this.get();
  }

  private read(): Settings {
    try {
      const text = this.store?.getItem(KEY);
      return text
        ? sanitize(JSON.parse(text) as unknown)
        : {
            ...DEFAULT_SETTINGS,
            songs: {},
            keyShifts: {},
            challenge: { ...DEFAULT_SETTINGS.challenge },
          };
    } catch {
      return {
        ...DEFAULT_SETTINGS,
        songs: {},
        keyShifts: {},
        challenge: { ...DEFAULT_SETTINGS.challenge },
      };
    }
  }
}

function sanitize(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const songs: Record<string, string> = {};
  if (typeof r['songs'] === 'object' && r['songs'] !== null) {
    for (const [k, v] of Object.entries(r['songs'] as Record<string, unknown>)) {
      if (typeof v === 'string') songs[k] = v;
    }
  }
  const validShift = (v: unknown): v is number =>
    typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= 12;
  const keyShifts: Record<string, number> = {};
  if (typeof r['keyShifts'] === 'object' && r['keyShifts'] !== null) {
    for (const [k, v] of Object.entries(r['keyShifts'] as Record<string, unknown>)) {
      if (validShift(v)) keyShifts[k] = v;
    }
  }
  const shift = r['keyShift'];
  const ch = (
    typeof r['challenge'] === 'object' && r['challenge'] !== null ? r['challenge'] : {}
  ) as Record<string, unknown>;
  const challenge: MelodySpec = {
    seed: isSeed(ch['seed']) ? ch['seed'] : DEFAULT_SETTINGS.challenge.seed,
    scale: isScaleId(ch['scale']) ? ch['scale'] : DEFAULT_SETTINGS.challenge.scale,
    level: isMelodyLevel(ch['level']) ? ch['level'] : DEFAULT_SETTINGS.challenge.level,
  };
  return {
    debug: typeof r['debug'] === 'boolean' ? r['debug'] : DEFAULT_SETTINGS.debug,
    guideTone: typeof r['guideTone'] === 'boolean' ? r['guideTone'] : DEFAULT_SETTINGS.guideTone,
    metronome: typeof r['metronome'] === 'boolean' ? r['metronome'] : DEFAULT_SETTINGS.metronome,
    listenFirst:
      typeof r['listenFirst'] === 'boolean' ? r['listenFirst'] : DEFAULT_SETTINGS.listenFirst,
    blind: typeof r['blind'] === 'boolean' ? r['blind'] : DEFAULT_SETTINGS.blind,
    goalMinutes: GOAL_MINUTES.includes(r['goalMinutes'] as number)
      ? (r['goalMinutes'] as number)
      : DEFAULT_SETTINGS.goalMinutes,
    seenHelp: typeof r['seenHelp'] === 'boolean' ? r['seenHelp'] : DEFAULT_SETTINGS.seenHelp,
    theme: THEMES.includes(r['theme'] as Theme) ? (r['theme'] as Theme) : DEFAULT_SETTINGS.theme,
    textSize: TEXT_SIZES.includes(r['textSize'] as TextSize)
      ? (r['textSize'] as TextSize)
      : DEFAULT_SETTINGS.textSize,
    effects: typeof r['effects'] === 'boolean' ? r['effects'] : DEFAULT_SETTINGS.effects,
    accompaniment: ACCOMPANIMENTS.includes(r['accompaniment'] as Accompaniment)
      ? (r['accompaniment'] as Accompaniment)
      : DEFAULT_SETTINGS.accompaniment,
    drone: DRONES.includes(r['drone'] as Drone) ? (r['drone'] as Drone) : DEFAULT_SETTINGS.drone,
    drums: DRUM_STYLES.includes(r['drums'] as DrumStyle)
      ? (r['drums'] as DrumStyle)
      : DEFAULT_SETTINGS.drums,
    keyShift: validShift(shift) ? shift : DEFAULT_SETTINGS.keyShift,
    keyShifts,
    difficulty: isDifficulty(r['difficulty']) ? r['difficulty'] : DEFAULT_SETTINGS.difficulty,
    windInstrument:
      typeof r['windInstrument'] === 'string' && findWindInstrument(r['windInstrument'])
        ? r['windInstrument']
        : DEFAULT_SETTINGS.windInstrument,
    windOctave: r['windOctave'] === 'exact' ? 'exact' : 'auto',
    showFingerings:
      typeof r['showFingerings'] === 'boolean'
        ? r['showFingerings']
        : DEFAULT_SETTINGS.showFingerings,
    checkChords:
      typeof r['checkChords'] === 'boolean' ? r['checkChords'] : DEFAULT_SETTINGS.checkChords,
    checkPitch:
      typeof r['checkPitch'] === 'boolean' ? r['checkPitch'] : DEFAULT_SETTINGS.checkPitch,
    voiceRange: isVoiceChoice(r['voiceRange']) ? r['voiceRange'] : DEFAULT_SETTINGS.voiceRange,
    duet: typeof r['duet'] === 'boolean' ? r['duet'] : DEFAULT_SETTINGS.duet,
    speed:
      typeof r['speed'] === 'number' && r['speed'] >= 0.5 && r['speed'] <= 1.25
        ? r['speed']
        : DEFAULT_SETTINGS.speed,
    songs,
    challenge,
    variation: isVariation(r['variation']) ? r['variation'] : DEFAULT_SETTINGS.variation,
    target:
      typeof r['target'] === 'number' &&
      Number.isInteger(r['target']) &&
      r['target'] >= 1 &&
      r['target'] <= 10
        ? r['target']
        : null,
  };
}

/** The key change for a profile; the old single `keyShift` still applies to the voice. */
export function keyShiftFor(s: Settings, profileId: string): number {
  return s.keyShifts[profileId] ?? (profileId === 'voice' ? s.keyShift : 0);
}

/** localStorage, or null when access is blocked (private windows, some embedded contexts). */
export function safeLocalStorage(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    s.getItem('lineup.probe');
    return s;
  } catch {
    return null;
  }
}
