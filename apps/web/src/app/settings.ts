import {
  DEFAULT_WIND_INSTRUMENT,
  findWindInstrument,
  isDifficulty,
  type Difficulty,
  type KeyValueStore,
} from '@lineup/core';

export interface Settings {
  /** Show the live debug overlay while playing. */
  debug: boolean;
  /** Play the target pitch as a quiet tone (needs headphones). */
  guideTone: boolean;
  /** Play a click on every beat. */
  metronome: boolean;
  /** Key change in semitones applied to the chart. */
  keyShift: number;
  /** Key change per profile (an instrument's key is not a singer's); wins over `keyShift`. */
  keyShifts: Record<string, number>;
  /** How forgiving sustained-pitch scoring is (Singline). */
  difficulty: Difficulty;
  /** Windline: which instrument you play (decides the key the song is moved into and the fingerings). */
  windInstrument: string;
  /** Windline: show the fingering of the current and next note while playing. */
  showFingerings: boolean;
  /** Strumline: also check that the right chord is strummed (experimental), not just the timing. */
  checkChords: boolean;
  /** Strumline: tempo multiplier for practice (1 = the song's own tempo). */
  speed: number;
  /** Last chosen song id per profile. */
  songs: Record<string, string>;
}

export const DEFAULT_SETTINGS: Settings = {
  debug: false,
  guideTone: true,
  metronome: true,
  keyShift: 0,
  keyShifts: {},
  difficulty: 'normal',
  windInstrument: DEFAULT_WIND_INSTRUMENT,
  showFingerings: true,
  checkChords: false,
  speed: 1,
  songs: {},
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
    };
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
        : { ...DEFAULT_SETTINGS, songs: {}, keyShifts: {} };
    } catch {
      return { ...DEFAULT_SETTINGS, songs: {}, keyShifts: {} };
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
  return {
    debug: typeof r['debug'] === 'boolean' ? r['debug'] : DEFAULT_SETTINGS.debug,
    guideTone: typeof r['guideTone'] === 'boolean' ? r['guideTone'] : DEFAULT_SETTINGS.guideTone,
    metronome: typeof r['metronome'] === 'boolean' ? r['metronome'] : DEFAULT_SETTINGS.metronome,
    keyShift: validShift(shift) ? shift : DEFAULT_SETTINGS.keyShift,
    keyShifts,
    difficulty: isDifficulty(r['difficulty']) ? r['difficulty'] : DEFAULT_SETTINGS.difficulty,
    windInstrument:
      typeof r['windInstrument'] === 'string' && findWindInstrument(r['windInstrument'])
        ? r['windInstrument']
        : DEFAULT_SETTINGS.windInstrument,
    showFingerings:
      typeof r['showFingerings'] === 'boolean'
        ? r['showFingerings']
        : DEFAULT_SETTINGS.showFingerings,
    checkChords:
      typeof r['checkChords'] === 'boolean' ? r['checkChords'] : DEFAULT_SETTINGS.checkChords,
    speed:
      typeof r['speed'] === 'number' && r['speed'] >= 0.5 && r['speed'] <= 1.25
        ? r['speed']
        : DEFAULT_SETTINGS.speed,
    songs,
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
