import {
  CalibrationStore,
  DEFAULT_WIND_INSTRUMENT,
  MAX_SEED,
  MELODY_LEVELS,
  SCALES,
  SCALE_IDS,
  SongClock,
  WIND_INSTRUMENTS,
  checkFit,
  chartEnd,
  bestOctaveShift,
  chartPitchRange,
  defaultOffsetFromLatencies,
  findWindInstrument,
  generateMelody,
  hashSeed,
  getProfile,
  inKey,
  isGenericWind,
  isSeed,
  letterGrade,
  melodyId,
  randomSeed,
  seedForDifficulty,
  rescaleChart,
  shiftForInstrument,
  songsFor,
  transposeChart,
  withOctaveForgiving,
  type Chart,
  type Difficulty,
  type MelodyLevel,
  type MelodySpec,
  type PitchFrame,
  type ScaleId,
  VARIATIONS,
  VARIATION_LABELS,
  applyPart,
  echoChart,
  songParts,
  varyChart,
  type Variation,
  type WindInstrument,
} from '@lineup/core';
import {
  analyzerOptionsFromProfile,
  detectBleed,
  workletSupported,
  toPitchFrame,
  type AnalysisFrame,
  type InputAdapter,
} from '@lineup/input';
import { micSupported, openMic, openSyntheticInput, type MicSession } from '@lineup/input/mic';
import { createRenderer, drawMeter, fitCanvas, midiName } from '@lineup/render';
import { renderPerformanceAsync, type Performer } from '@lineup/sim';
import { buildInfoText } from '../build-info';
import { copyText } from '../clipboard';
import { escapeHtml, playTone } from '../audio';
import {
  planAllBacking,
  planBacking,
  playBacking,
  type BackingEvent,
  midiToHz,
  type BackingHandle,
} from '../game/backing';
import { fingeringChartHtml, fingeringStripHtml } from '../game/fingering-view';
import { micAdvice, type MicStatus } from '../game/mic-advice';
import { formatSessionLog } from '../game/session-log';
import { SinglineGame, type DebugInfo } from '../game/singline-game';
import { songSummary } from '../game/song-info';
import { ScoreStore, describeBest, scoreKey } from '../scores';
import { UserSongStore, userSongsFor } from '../user-songs';
import { completedCourse, starsBySong } from '../scoreboard';
import { hashParam } from '../courses';
import { dailyFor, dailyKey, wantsDaily, type DailyGame } from '../daily';
import { ProgressStore } from '../progress';
import { jingleFor, playJingle } from '../game/jingle';
import { playResultFor, rewardHtml } from '../game/reward';
import { SettingsStore, nextSpeed, keyShiftFor, safeLocalStorage } from '../settings';
import { RANDOM_MELODY, addRandomMelodyOption, fillSongMenu, fillTargetMenu } from '../song-menu';
import { formatCents, formatDb } from '../format';
import type { Screen } from '../router';

/** What differs between the pitch-based games (Singline, Windline); everything else is shared. */
export interface PitchScreenConfig {
  mode: 'Singline' | 'Windline';
  /** Instrument profile and song list to use. */
  profileId: string;
  /** Page heading, e.g. "Singline" with the small subtitle "voice". */
  title: string;
  subtitle: string;
  /** Shown under the mic meter before anything is played. */
  micPrompt: string;
  /** Per-status mic advice wording; statuses not listed use the voice wording from `micAdvice`. */
  adviceText?: Partial<Record<MicStatus, string>>;
  /** "singing, humming or a TV": what the quiet-baseline check might be hearing. */
  quietExamples: string;
  /** The range line under the song picker. */
  rangeText: (low: string, high: string) => string;
  /** The synthetic player for the auto-play demo, e.g. "singer". */
  demoWho: string;
  demoPerformer: () => Performer;
  /**
   * Diatonic instruments in different keys (Windline): adds an instrument picker that moves the
   * song into the instrument's key, a fingering chart, fingerings while playing, and a practice speed.
   */
  instruments?: boolean;
}

const KEY_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

/** The key a generic C instrument is in after moving up `semitones`: "D" for +2. */
const keyName = (semitones: number): string => `Key of ${KEY_NAMES[((semitones % 12) + 12) % 12]}`;

const template = (c: PitchScreenConfig) => `
  <p><a href="#/">← Back</a></p>
  <h1>${c.title} <small>${c.subtitle}</small></h1>
  <div data-id="stage-setup"></div>
  <div data-id="stage-play" hidden></div>
  <div data-id="stage-results" hidden></div>
`;

const setup = (c: PitchScreenConfig) => `
  <div class="banner warn" data-id="headphone-banner">
    <strong>Use headphones.</strong> The guide tone and clicks play from the speaker, and your mic will hear them.
  </div>

  <section class="panel">
    <h2>1. Microphone</h2>
    <div class="row">
      <button data-id="mic-start">Start mic</button>
      <button data-id="bleed-check" disabled>Check for speaker leak</button>
    </div>
    <canvas class="meter" data-id="meter" role="img" aria-label="Live microphone level"></canvas>
    <dl>
      <dt>Note</dt><dd data-id="note">–</dd>
      <dt>Clarity</dt><dd><span class="bar"><span data-id="clarity-bar"></span></span> <span data-id="clarity">–</span></dd>
      <dt>Level</dt><dd data-id="level">–</dd>
    </dl>
    <p class="status" data-id="advice" role="status">${c.micPrompt}</p>
    <p class="status" data-id="bleed-result"></p>
  </section>

  <section class="panel">
    <h2>2. ${c.instruments ? 'Instrument, song &amp; key' : 'Song &amp; key'}</h2>
    <div class="row">
      ${c.instruments ? '<label>Instrument <select data-id="instrument"></select></label>' : ''}
      <label>Song <select data-id="song"></select></label>
      <label>Version <select data-id="variation"></select></label>
      <label data-id="part-label" hidden>Part <select data-id="part"></select></label>
      <label class="check"><input type="checkbox" data-id="listen" /> Listen first, then play it back</label>
      <label><span data-id="key-label">Key</span> <select data-id="key"></select></label>
      <button data-id="hear">Hear first note</button>
    </div>
    <div class="row" data-id="challenge" hidden>
      <label>Scale <select data-id="challenge-scale"></select></label>
      <label>Level <select data-id="challenge-level"></select></label>
      <label>Seed <input data-id="challenge-seed" type="number" min="0" max="${MAX_SEED}" step="1" inputmode="numeric" /></label>
      <label>Aim for <select data-id="challenge-target"></select></label>
      <button data-id="challenge-new">New melody</button>
    </div>
    <p data-id="range"></p>
    <p data-id="song-info"></p>
    <p data-id="best"></p>
  </section>

  ${
    c.instruments
      ? `<details class="panel" data-id="chart-panel" open>
    <summary>Fingering chart</summary>
    <div class="fingering-chart" data-id="chart"></div>
  </details>`
      : ''
  }

  <section class="panel">
    <h2>3. Options</h2>
    <label>Scoring
      <select data-id="difficulty">
        <option value="easy">Easy (wide pitch window)</option>
        <option value="normal">Normal</option>
        <option value="strict">Strict</option>
      </select>
    </label>
    ${
      c.instruments
        ? `<label>Speed
      <select data-id="speed">
        <option value="0.5">50%</option>
        <option value="0.65">65%</option>
        <option value="0.8">80%</option>
        <option value="1">100%</option>
      </select>
    </label>
    <label>Octave
      <select data-id="octave">
        <option value="auto">Any octave: follow how I play (recommended)</option>
        <option value="exact">Exactly the octave shown</option>
      </select>
    </label>
    <label class="check"><input type="checkbox" data-id="opt-fingerings" /> Show the fingering of the current and next note while playing</label>`
        : ''
    }
    <label class="check"><input type="checkbox" data-id="opt-guide" /> Guide tone (needs headphones)</label>
    <label class="check"><input type="checkbox" data-id="opt-metronome" /> Metronome clicks</label>
    <label class="check"><input type="checkbox" data-id="opt-debug" /> Debug overlay while playing</label>
    <p data-id="cal-status"></p>
    <p><a href="#/calibrate">Calibrate timing</a></p>
  </section>

  <div class="row">
    <button data-id="play" class="primary">Play</button>
    <button data-id="demo">Watch auto-play demo (no mic)</button>
  </div>
  <p class="status" data-id="setup-status" role="status"></p>
`;

const PLAY = `
  <div class="hud">
    <div><span class="label">Score</span> <strong data-id="score">0</strong></div>
    <div><span class="label">Combo</span> <strong data-id="combo">0</strong> <small data-id="mult"></small></div>
    <div><span class="label">Accuracy</span> <strong data-id="acc">–</strong></div>
    <button data-id="stop">Stop</button>
  </div>
  <div class="stage-wrap">
    <canvas class="stage" data-id="stage" role="img" aria-label="The song: notes scrolling toward the now line"></canvas>
    <div class="overlay" data-id="overlay" aria-live="assertive"></div>
  </div>
  <div class="fingering" data-id="fingering" hidden></div>
  <pre class="debug" data-id="debug" hidden></pre>
`;

type GameAudio = { adapter: InputAdapter; ctx: AudioContext; demo: boolean };

export const createPitchScreen =
  (c: PitchScreenConfig): Screen =>
  (root) => {
    root.innerHTML = template(c);
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const el = root.querySelector<T>(`[data-id="${id}"]`);
      if (!el) throw new Error(`missing [data-id=${id}]`);
      return el;
    };
    const stages = { setup: $('stage-setup'), play: $('stage-play'), results: $('stage-results') };
    const show = (name: keyof typeof stages) => {
      for (const [k, el] of Object.entries(stages)) el.hidden = k !== name;
    };

    const profile = getProfile(c.profileId);
    const mine = new UserSongStore(safeLocalStorage());
    const songs = [...songsFor(c.profileId), ...userSongsFor(c.profileId, mine)];
    const settings = new SettingsStore(safeLocalStorage());
    const calibration = new CalibrationStore(safeLocalStorage());
    const scores = new ScoreStore(safeLocalStorage());
    const progress = new ProgressStore(safeLocalStorage());

    let mic: MicSession | null = null;
    let live: GameAudio | null = null;
    /** When the current play-through started: the session log reports this, not the time of the copy. */
    let sessionStart = new Date();
    let disposed = false;
    /** True while a start is in flight: a double tap must not open two sessions (the first would leak). */
    let beginInFlight = false;
    let setupRaf = 0;
    let playRaf = 0;
    let backing: BackingHandle | null = null;
    let leakTest = false;
    const leakFrames: PitchFrame[] = [];
    const recent: boolean[] = []; // last ~1 s: was the frame voiced?
    let lastFrame: AnalysisFrame | null = null;
    let peakHold = -120;

    // ------------------------------------------------------------------ setup

    stages.setup.innerHTML = setup(c);
    const S = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const el = stages.setup.querySelector<T>(`[data-id="${id}"]`);
      if (!el) throw new Error(`missing setup [data-id=${id}]`);
      return el;
    };
    const micBtn = S<HTMLButtonElement>('mic-start');
    const bleedBtn = S<HTMLButtonElement>('bleed-check');
    const songSel = S<HTMLSelectElement>('song');
    const keySel = S<HTMLSelectElement>('key');
    const meter = S<HTMLCanvasElement>('meter');
    const setupStatus = S('setup-status');

    const current = settings.get();
    const stars = starsBySong(scores.entries(), c.profileId);
    fillSongMenu(songSel, songs, (id) => stars.get(id) ?? null);
    addRandomMelodyOption(songSel);
    // opened from today's challenge: choose its random melody (the same for everyone today)
    const dailyGame: DailyGame = c.profileId === 'wind' ? 'windline' : 'singline';
    if (wantsDaily(location.hash)) {
      settings.update({
        challenge: dailyFor(dailyGame).spec,
        variation: 'original',
        songs: { ...current.songs, [c.profileId]: RANDOM_MELODY },
      });
      current.songs[c.profileId] = RANDOM_MELODY;
    }
    // opened from a learning path step: choose its song
    const wantedSong = hashParam(location.hash, 'song');
    if (wantedSong && songs.some((s) => s.id === wantedSong)) {
      // a lesson is played whole and as written, or its stars would not count toward the path
      settings.update({
        variation: 'original',
        listenFirst: false,
        ...(c.instruments ? { speed: 1 } : {}),
      });
      settings.update({ songs: { ...current.songs, [c.profileId]: wantedSong } });
      current.songs[c.profileId] = wantedSong;
    }
    const savedSong = current.songs[c.profileId];
    songSel.value =
      savedSong === RANDOM_MELODY || songs.some((s) => s.id === savedSong)
        ? savedSong!
        : songs[0]!.id;
    /** The instrument chosen on a Windline screen. The generic one takes its key from the shift. */
    const instrument = (): WindInstrument => {
      const base =
        findWindInstrument(settings.get().windInstrument) ??
        findWindInstrument(DEFAULT_WIND_INSTRUMENT)!;
      return isGenericWind(base) ? inKey(base, keyShiftFor(settings.get(), c.profileId)) : base;
    };
    /** The shift applied on top of moving the song into the instrument's key (none for the generic one, which is the shift). */
    const extraShift = (): number =>
      c.instruments && isGenericWind(instrument()) ? 0 : Number(keySel.value);

    /** The key menu: semitones from the original key, or, for a generic instrument, the key itself. */
    const fillKeyMenu = () => {
      const generic = c.instruments && isGenericWind(instrument());
      S('key-label').textContent = generic ? 'Key' : c.instruments ? 'Extra shift' : 'Key';
      keySel.replaceChildren();
      for (let k = -12; k <= 12; k++) {
        const sign = `${k > 0 ? '+' : '−'}${Math.abs(k)} semitones`;
        const label = generic
          ? `${keyName(k)}${k === 0 ? '' : ` (${sign})`}`
          : k === 0
            ? c.instruments
              ? 'None'
              : 'Original key'
            : sign;
        keySel.add(new Option(label, String(k)));
      }
      keySel.value = String(keyShiftFor(settings.get(), c.profileId));
    };
    fillKeyMenu();
    if (c.instruments) {
      const instrumentSel = S<HTMLSelectElement>('instrument');
      for (const i of WIND_INSTRUMENTS) instrumentSel.add(new Option(i.label, i.id));
      instrumentSel.value = instrument().id;
      instrumentSel.addEventListener('change', () => {
        // a new instrument starts from its own key: the old shift belongs to the old instrument
        settings.update({
          windInstrument: instrumentSel.value,
          keyShifts: { ...settings.get().keyShifts, [c.profileId]: 0 },
        });
        fillKeyMenu();
        refreshRange();
      });
      const speedSel = S<HTMLSelectElement>('speed');
      speedSel.value = String(current.speed);
      speedSel.addEventListener('change', () => {
        settings.update({ speed: Number(speedSel.value) });
        refreshRange();
      });
      const octaveSel = S<HTMLSelectElement>('octave');
      octaveSel.value = current.windOctave;
      octaveSel.addEventListener('change', () => {
        settings.update({ windOctave: octaveSel.value === 'exact' ? 'exact' : 'auto' });
        refreshRange();
      });
      const fingerBox = S<HTMLInputElement>('opt-fingerings');
      fingerBox.checked = current.showFingerings;
      fingerBox.addEventListener('change', () =>
        settings.update({ showFingerings: fingerBox.checked }),
      );
    }
    const difficultySel = S<HTMLSelectElement>('difficulty');
    difficultySel.value = current.difficulty;
    S<HTMLInputElement>('opt-guide').checked = current.guideTone;
    S<HTMLInputElement>('opt-metronome').checked = current.metronome;
    S<HTMLInputElement>('opt-debug').checked = current.debug;

    // the random melody: its spec lives in the settings, and the seed is shown so it can be replayed
    const challengeRow = S('challenge');
    const scaleSel = S<HTMLSelectElement>('challenge-scale');
    const levelSel = S<HTMLSelectElement>('challenge-level');
    const seedInput = S<HTMLInputElement>('challenge-seed');
    for (const id of SCALE_IDS) scaleSel.add(new Option(SCALES[id].label, id));
    for (const level of MELODY_LEVELS)
      levelSel.add(new Option(level[0]!.toUpperCase() + level.slice(1), level));
    const showChallenge = () => {
      const spec = settings.get().challenge;
      scaleSel.value = spec.scale;
      levelSel.value = spec.level;
      seedInput.value = String(spec.seed);
      challengeRow.hidden = songSel.value !== RANDOM_MELODY;
    };
    showChallenge();

    /** The random melody for the current spec, generated once per spec. */
    let melodyCache: { id: string; chart: Chart } | null = null;
    const randomMelody = () => {
      const spec = settings.get().challenge;
      const id = melodyId(c.profileId, spec);
      if (melodyCache?.id !== id) melodyCache = { id, chart: generateMelody(c.profileId, spec) };
      return melodyCache;
    };
    const songEntry = () =>
      songSel.value === RANDOM_MELODY
        ? randomMelody()
        : (songs.find((s) => s.id === songSel.value) ?? songs[0]!);

    /** The chosen song, as written or in its easier or harder version. */
    const wholeSong = (): Chart => {
      const entry = songEntry();
      return varyChart(entry.chart, settings.get().variation, hashSeed(entry.id));
    };
    /** The part of the song to practise (an index into its phrases), or -1 for all of it. */
    let partIdx = -1;
    let partFor = '';
    const partSel = S<HTMLSelectElement>('part');
    /** Offers the phrases of the chosen song; a different song or version goes back to the whole. */
    const syncParts = () => {
      const parts = songParts(wholeSong());
      const key = `${songEntry().id}|${settings.get().variation}|${parts.length}`;
      if (key !== partFor) {
        partFor = key;
        partIdx = -1;
        partSel.replaceChildren(new Option('Whole song', '-1'));
        parts.forEach((p, i) => partSel.add(new Option(p.label, String(i))));
      }
      partSel.value = String(partIdx);
      S('part-label').hidden = parts.length < 2;
    };
    partSel.addEventListener('change', () => {
      partIdx = Number(partSel.value);
      refreshRange();
    });
    const listenBox = S<HTMLInputElement>('listen');
    listenBox.checked = settings.get().listenFirst;
    listenBox.addEventListener('change', () => {
      settings.update({ listenFirst: listenBox.checked });
      refreshRange();
    });
    /** The chosen song, version and part. */
    const variedSong = (): Chart => applyPart(wholeSong(), partIdx);

    /** The chart as played: moved into the instrument's key, shifted, and at the practice speed. */
    const selectedChart = (): Chart => {
      const song = variedSong();
      const toInstrument = c.instruments ? shiftForInstrument(song, instrument()) : 0;
      const moved = transposeChart(song, toInstrument + extraShift());
      return c.instruments ? rescaleChart(moved, settings.get().speed) : moved;
    };

    /** Windline: count the right note in whatever octave the player plays it. */
    const anyOctave = (): boolean => c.instruments === true && settings.get().windOctave === 'auto';
    /** The profile as judged: octave-forgiving when the player asked for any octave. */
    const judgedProfile = () =>
      withOctaveForgiving(profile, profile.judgment.pitch?.octaveForgiving === true || anyOctave());

    /** Best-score bucket: the song at the chosen scoring level (and, for winds, practice speed). */
    const bestKey = () =>
      scoreKey(
        c.profileId,
        songEntry().id,
        `${
          c.instruments
            ? `${settings.get().difficulty}|x${settings.get().speed}${anyOctave() ? '|anyoctave' : ''}`
            : settings.get().difficulty
        }${settings.get().variation === 'original' ? '' : `|${settings.get().variation}`}${
          partIdx >= 0 ? `|part${partIdx + 1}` : ''
        }${settings.get().listenFirst ? '|echo' : ''}`,
      );

    const refreshRange = () => {
      syncParts();
      const chart = selectedChart();
      const r = chartPitchRange(chart);
      let text = r ? c.rangeText(midiName(r.low), midiName(r.high)) : '';
      // Voices are folded into range; an instrument has one register, so a key that pushes
      // the song past what the detector hears would silently miss every note.
      const d = profile.detector;
      if (
        r &&
        !d.foldIntoRange &&
        !anyOctave() &&
        (midiToHz(r.low) < d.minHz || midiToHz(r.high) > d.maxHz)
      )
        text += ` ${c.mode} cannot hear every note in this key: try another.`;
      if (c.instruments) {
        const inst = instrument();
        const pitches = chart.notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch]));
        // playing in any octave: check the song in the octave that suits this instrument best
        const octaveMove = anyOctave() && r ? bestOctaveShift(r, inst.range) : 0;
        const fit = checkFit(
          pitches.map((p) => p + octaveMove),
          inst,
        );
        const names = (ms: number[]) => ms.map(midiName).join(', ');
        if (fit.outOfRange.length)
          text += ` ⚠ Outside this instrument's range: ${names(fit.outOfRange)}. Try another instrument or Extra shift.`;
        if (fit.noFingering.length)
          text += ` ⚠ No fingering known for: ${names(fit.noFingering)} (use your instrument's own chart for these).`;
      }
      S('range').textContent = text;
      // a random melody has no fixed title to find in the menu: say which one this is
      S('song-info').textContent =
        songSel.value === RANDOM_MELODY
          ? `${chart.meta.title} · ${songSummary(chart)}`
          : songSummary(chart);
      S('best').textContent = describeBest(scores.best(bestKey()));
      if (c.instruments) {
        S('chart').innerHTML = fingeringChartHtml(
          instrument(),
          new Set(chart.notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch]))),
        );
      }
    };
    refreshRange();

    const refreshCalibration = () => {
      const rec = mic ? calibration.load(mic.track.getSettings().deviceId || 'default') : null;
      S('cal-status').textContent = rec
        ? `Timing calibration: ${rec.offsetMs.toFixed(0)} ms (${rec.quality}).`
        : mic
          ? 'Not calibrated: using the browser’s latency estimate. Calibrating makes timing fairer.'
          : 'Start the mic to load your saved timing calibration.';
    };
    refreshCalibration();

    const variationSel = S<HTMLSelectElement>('variation');
    for (const v of VARIATIONS) variationSel.add(new Option(VARIATION_LABELS[v], v));
    variationSel.value = settings.get().variation;
    variationSel.addEventListener('change', () => {
      settings.update({ variation: variationSel.value as Variation });
      refreshRange();
    });
    songSel.addEventListener('change', () => {
      settings.update({ songs: { ...settings.get().songs, [c.profileId]: songSel.value } });
      showChallenge();
      refreshRange();
    });
    const updateChallenge = (patch: Partial<MelodySpec>) => {
      settings.update({ challenge: { ...settings.get().challenge, ...patch } });
      showChallenge();
      refreshRange();
    };
    scaleSel.addEventListener('change', () =>
      updateChallenge({ scale: scaleSel.value as ScaleId }),
    );
    levelSel.addEventListener('change', () =>
      updateChallenge({ level: levelSel.value as MelodyLevel }),
    );
    seedInput.addEventListener('change', () => {
      const seed = Number(seedInput.value);
      updateChallenge(isSeed(seed) ? { seed } : {}); // an invalid entry snaps back to the current seed
    });
    const targetSel = S<HTMLSelectElement>('challenge-target');
    fillTargetMenu(targetSel);
    targetSel.value = String(settings.get().target ?? 0);
    targetSel.addEventListener('change', () => {
      const n = Number(targetSel.value);
      settings.update({ target: n >= 1 ? n : null });
    });
    S('challenge-new').addEventListener('click', () => {
      const spec = settings.get().challenge;
      const target = settings.get().target;
      const variation = settings.get().variation;
      // rate each candidate the way it will be played, in the chosen version
      const played = (seed: number): Chart => {
        const next = { ...spec, seed };
        return varyChart(
          generateMelody(c.profileId, next),
          variation,
          hashSeed(melodyId(c.profileId, next)),
        );
      };
      updateChallenge({ seed: target !== null ? seedForDifficulty(played, target) : randomSeed() });
    });
    keySel.addEventListener('change', () => {
      settings.update({
        keyShifts: { ...settings.get().keyShifts, [c.profileId]: Number(keySel.value) },
      });
      refreshRange();
    });
    difficultySel.addEventListener('change', () => {
      settings.update({ difficulty: difficultySel.value as Difficulty });
      refreshRange();
    });
    S<HTMLInputElement>('opt-guide').addEventListener('change', (e) =>
      settings.update({ guideTone: (e.target as HTMLInputElement).checked }),
    );
    S<HTMLInputElement>('opt-metronome').addEventListener('change', (e) =>
      settings.update({ metronome: (e.target as HTMLInputElement).checked }),
    );
    S<HTMLInputElement>('opt-debug').addEventListener('change', (e) =>
      settings.update({ debug: (e.target as HTMLInputElement).checked }),
    );

    const onSetupMessage = (m: Parameters<MicSession['onMessage']>[0]) => {
      if (m.type !== 'frame') return;
      const f = m.frame;
      lastFrame = f;
      peakHold = Math.max(f.peakDb, peakHold - 0.4);
      const voiced =
        f.pitchHz !== null &&
        f.clarity >= profile.detector.clarityThreshold &&
        f.rmsDb >= profile.detector.minLevelDb;
      recent.push(voiced);
      if (recent.length > 190) recent.shift();
      if (leakTest) leakFrames.push(toPitchFrame(f));
    };

    const startMic = async (): Promise<MicSession | null> => {
      if (mic) return mic;
      micBtn.disabled = true;
      setupStatus.textContent = 'Opening microphone…';
      try {
        mic = await openMic(undefined, 0, analyzerOptionsFromProfile(profile));
        if (disposed) {
          await mic.close();
          return null;
        }
        mic.onMessage = onSetupMessage;
        micBtn.textContent = 'Mic on';
        bleedBtn.disabled = false;
        setupStatus.textContent = '';
        refreshCalibration();
        return mic;
      } catch (err) {
        micBtn.disabled = false;
        setupStatus.textContent = err instanceof Error ? err.message : String(err);
        setupStatus.classList.add('error');
        return null;
      }
    };
    micBtn.addEventListener('click', () => void startMic());

    bleedBtn.addEventListener('click', async () => {
      if (!mic) return;
      bleedBtn.disabled = true;
      const out = S('bleed-result');
      out.className = 'status';
      const tone = 523.25;
      const collect = async (ms: number): Promise<PitchFrame[]> => {
        leakFrames.length = 0;
        leakTest = true;
        await new Promise<void>((resolve) => setTimeout(resolve, ms));
        leakTest = false;
        return leakFrames.slice();
      };

      // 1. A quiet baseline first: if there is already pitched sound (you humming, a TV), the
      //    result of the tone test would be meaningless, so ask for quiet instead of guessing.
      out.textContent = 'Stay quiet… listening to the room.';
      const baseline = await collect(900);
      if (
        detectBleed(baseline, tone, { toleranceCents: 1200 }).bleeding ||
        baseline.filter((f) => f.frequency !== null).length > baseline.length * 0.3
      ) {
        out.textContent = `I can already hear pitched sound (${c.quietExamples}). Stay quiet and run the check again.`;
        out.classList.add('error');
        bleedBtn.disabled = false;
        return;
      }

      // 2. Then play the tone and see whether the mic hears it.
      out.textContent = 'Still quiet… playing a test tone.';
      leakFrames.length = 0;
      leakTest = true;
      const t0 = mic.ctx.currentTime;
      await playTone(mic.ctx, tone, 1.4, 0.3);
      leakTest = false;
      const frames = leakFrames.filter((f) => f.time >= t0 + 0.25 && f.time <= t0 + 1.2);
      const r = detectBleed(frames, tone);
      out.textContent = r.bleeding
        ? `⚠ Your mic hears the speaker (${(r.fraction * 100).toFixed(0)}% of the tone, ${r.meanLevelDb?.toFixed(0)} dB). Use headphones, or the guide tone will score for you.`
        : '✓ No speaker leak detected.';
      out.classList.toggle('error', r.bleeding);
      bleedBtn.disabled = false;
    });

    S('hear').addEventListener('click', async () => {
      const ctx = mic?.ctx ?? new AudioContext();
      const first = selectedChart().notes.find((n) => n.pitch !== undefined);
      if (first?.pitch !== undefined) await playTone(ctx, midiToHz(first.pitch), 1.2, 0.2);
      if (!mic) void ctx.close();
    });

    /** Mic meters + advice, refreshed with the animation frame while on the setup stage. */
    const setupTick = () => {
      setupRaf = requestAnimationFrame(setupTick);
      if (!stages.play.hidden || !stages.results.hidden) return;
      if (meter.clientWidth > 0 && lastFrame) {
        drawMeter(meter, lastFrame.rmsDb, peakHold, {
          bar: '#118ab2',
          peak: '#ffd166',
          hot: '#ef476f',
        });
      }
      if (!lastFrame) return;
      const f = lastFrame;
      const voicedFraction = recent.length ? recent.filter(Boolean).length / recent.length : 0;
      const named = f.pitchHz !== null && f.clarity >= profile.detector.clarityThreshold;
      S('note').textContent =
        named && f.pitchHz !== null
          ? `${midiName(Math.round(69 + 12 * Math.log2(f.pitchHz / 440)))}  ${f.pitchHz.toFixed(1)} Hz`
          : '–';
      S('level').textContent = `${formatDb(f.rmsDb)}  (peak ${formatDb(peakHold)})`;
      S('clarity').textContent = f.clarity.toFixed(2);
      S('clarity-bar').style.width = `${Math.round(f.clarity * 100)}%`;
      S('clarity-bar').classList.toggle('good', f.clarity >= profile.detector.clarityThreshold);
      const advice = micAdvice({ levelDb: f.rmsDb, peakDb: peakHold, voicedFraction });
      const adviceEl = S('advice');
      // only touch the live region when the message changes, so it is not re-announced every frame
      const adviceMessage = c.adviceText?.[advice.status] ?? advice.message;
      if (adviceEl.textContent !== adviceMessage) adviceEl.textContent = adviceMessage;
      adviceEl.className = `status ${advice.status === 'good' ? 'ok' : advice.status === 'silent' ? '' : 'error'}`;
    };
    setupRaf = requestAnimationFrame(setupTick);

    // ------------------------------------------------------------------- play

    const latencyOffset = (ctx: AudioContext): number => {
      const key = mic?.track.getSettings().deviceId || 'default';
      const rec = mic ? calibration.load(key) : null;
      return rec
        ? rec.offsetMs / 1000
        : defaultOffsetFromLatencies({
            baseLatency: ctx.baseLatency,
            outputLatency: ctx.outputLatency,
          });
    };

    const stopPlay = () => {
      cancelAnimationFrame(playRaf);
      backing?.stop();
      backing = null;
    };

    /** `listenEnd` is when the player's turn starts after hearing the song (0 when there is no listening part). */
    const runGame = (
      audio: GameAudio,
      chart: Chart,
      offset: number,
      startAt: number,
      listen: { end: number; tones: BackingEvent[] } = { end: 0, tones: [] },
    ) => {
      const { adapter, ctx, demo } = audio;
      sessionStart = new Date();
      stages.play.innerHTML = PLAY;
      show('play');
      const P = <T extends HTMLElement = HTMLElement>(id: string): T => {
        const el = stages.play.querySelector<T>(`[data-id="${id}"]`);
        if (!el) throw new Error(`missing play [data-id=${id}]`);
        return el;
      };
      const stage = P<HTMLCanvasElement>('stage');
      const overlay = P('overlay');
      const debugEl = P<HTMLPreElement>('debug');
      const opts = settings.get();
      debugEl.hidden = !opts.debug;

      const spb = 60 / chart.meta.bpm;
      const countIn = chart.meta.countInBeats * spb;
      const clock = new SongClock(ctx);
      clock.start(-countIn, startAt);
      const game = new SinglineGame({
        chart,
        profile: judgedProfile(),
        clock,
        latencyOffset: offset,
        hop: profile.detector.hopSize / ctx.sampleRate,
        difficulty: opts.difficulty,
      });
      adapter.onMessage = (m) => game.handleMessage(m);
      backing = playBacking(
        ctx,
        clock,
        [
          ...planAllBacking(chart, {
            metronome: opts.metronome,
            guideTone: opts.guideTone,
            accompaniment: settings.get().accompaniment,
            drums: settings.get().drums,
          }),
          ...listen.tones,
        ].sort((a, b) => a.songTime - b.songTime),
      );
      const renderer = createRenderer(profile.renderer);
      const endAt = chartEnd(chart) + 0.9;
      // Windline: the fingering of the note being played and the next one, redrawn when they change
      const inst = instrument();
      const fingerEl = c.instruments && opts.showFingerings ? P<HTMLElement>('fingering') : null;
      if (fingerEl) fingerEl.hidden = false;
      let fingeringKey = '';
      const fingerKeyNow = (songTime: number): string => {
        const t = songTime - offset;
        const i = chart.notes.findIndex((n) => t < n.t + Math.max(n.duration, 0.2));
        // the note counts as "now" once it has started, so the key changes then too
        return `${i}:${i >= 0 && t >= chart.notes[i]!.t}`;
      };
      let lastDebug = 0;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        stopPlay();
        game.session.finish();
        if (!demo) adapter.onMessage = onSetupMessage;
        showResults(game, chart, audio);
      };

      P('stop').addEventListener('click', () => {
        finished = true;
        stopPlay();
        adapter.onMessage = mic ? onSetupMessage : () => undefined;
        if (demo) void adapter.close();
        show('setup');
      });

      const tick = () => {
        playRaf = requestAnimationFrame(tick);
        const now = clock.now();
        game.update();
        const { g, width, height } = fitCanvas(stage);
        renderer.draw(g, { width, height }, game.view());

        const s = game.session.score;
        P('score').textContent = String(s.score);
        P('combo').textContent = String(s.combo);
        P('mult').textContent = s.multiplier > 1 ? `×${s.multiplier.toFixed(1)}` : '';
        P('acc').textContent = s.judged ? `${Math.round(s.accuracy * 100)}%` : '–';

        if (now < 0) {
          const beats = Math.ceil(-now / spb - 1e-6);
          overlay.textContent = String(Math.max(1, beats));
          overlay.classList.add('on');
        } else if (listen.end > 0 && now < listen.end - spb) {
          overlay.textContent = 'Listen…';
          overlay.classList.add('on');
        } else if (listen.end > 0 && now < listen.end) {
          overlay.textContent = 'Your turn!';
          overlay.classList.add('on');
        } else {
          overlay.classList.remove('on');
        }

        if (fingerEl && fingeringKey !== fingerKeyNow(now)) {
          fingeringKey = fingerKeyNow(now);
          fingerEl.innerHTML = fingeringStripHtml(inst, chart, now - offset);
        }

        if (opts.debug && ctx.currentTime - lastDebug > 0.1) {
          lastDebug = ctx.currentTime;
          debugEl.textContent = formatDebug(game.debug(ctx.currentTime), now, demo);
        }
        if (now > endAt) finish();
      };
      playRaf = requestAnimationFrame(tick);
    };

    /** Whether the song just played is today's challenge, played whole and as written. */
    const isDaily = (id: string): boolean =>
      id === dailyFor(dailyGame).id && settings.get().variation === 'original' && partIdx < 0;

    const showResults = (game: SinglineGame, chart: Chart, audio: GameAudio) => {
      const s = game.session.score;
      const grade = letterGrade(s.accuracy);
      // the auto-play demo is a synthetic player: it never sets a high score
      const best = audio.demo
        ? null
        : scores.record(bestKey(), { score: s.score, accuracy: s.accuracy, grade });
      refreshRange(); // the setup screen's best-score line now shows this result
      // stars, XP and trophies: the demo earns none
      const outcome = audio.demo
        ? null
        : progress.recordPlay(
            playResultFor(
              profile.id,
              songEntry().id,
              chart,
              s,
              isDaily(songEntry().id) ? { key: dailyKey(dailyGame) } : undefined,
            ),
          );
      if (outcome && completedCourse(scores.entries())) progress.grant('graduate');
      const reward = outcome ? rewardHtml(s.accuracy, outcome) : '';
      const bestLine = audio.demo
        ? 'Demo run: not saved as a score.'
        : best!.isNewBest
          ? 'New best!'
          : describeBest(best!.best);
      // a clean run at a practice speed offers the next speed up
      const faster =
        !audio.demo && c.instruments && s.accuracy >= 0.9 ? nextSpeed(settings.get().speed) : null;
      stages.results.innerHTML = `
      <section class="panel results">
        <div class="grade" data-id="grade">${grade}</div>
        <p class="status" data-id="best-line" role="status">${bestLine}</p>
        ${reward}
        <dl>
          <dt>Score</dt><dd data-id="r-score">${s.score}</dd>
          <dt>Accuracy</dt><dd data-id="r-acc">${Math.round(s.accuracy * 100)}%</dd>
          <dt>Perfect</dt><dd data-id="r-perfect">${s.counts.perfect}</dd>
          <dt>Good</dt><dd data-id="r-good">${s.counts.good}</dd>
          <dt>Missed</dt><dd data-id="r-miss">${s.counts.miss}</dd>
          <dt>Best combo</dt><dd data-id="r-combo">${s.maxCombo}</dd>
        </dl>
        <div class="strip" data-id="strip">${game.session.statuses
          .map(
            (st, i) =>
              `<span class="cell ${st}" title="${escapeHtml(midiName(chart.notes[i]?.pitch ?? 0))}"></span>`,
          )
          .join('')}</div>
        <div class="row">
          <button data-id="again" class="primary">Play again</button>
          ${faster ? `<button data-id="faster">Faster: ${Math.round(faster * 100)}% speed</button>` : ''}
          <button data-id="back">Back to setup</button>
          <button data-id="copy-log">Copy session log</button>
        </div>
        <p class="status" data-id="copy-status" role="status"></p>
      </section>`;
      show('results');
      if (!audio.demo && settings.get().effects) {
        const kind = jingleFor(outcome, best?.isNewBest ?? false);
        try {
          if (kind) playJingle(audio.ctx, kind);
        } catch {
          // the audio context may already be closed: the jingle is a nicety
        }
      }
      const R = (id: string) =>
        stages.results.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
      stages.results.querySelector('[data-id=faster]')?.addEventListener('click', () => {
        if (faster === null) return;
        settings.update({ speed: faster });
        S<HTMLSelectElement>('speed').value = String(faster);
        R('again').click();
      });
      R('copy-log').addEventListener('click', () => {
        const text = formatSessionLog({
          build: buildInfoText(),
          mode: c.mode,
          at: sessionStart,
          userAgent: navigator.userAgent,
          profileId: profile.id,
          songTitle: chart.meta.title,
          demo: audio.demo,
          options: {
            difficulty: settings.get().difficulty,
            keyShift: Number(keySel.value),
            guideTone: settings.get().guideTone,
            metronome: settings.get().metronome,
            ...(c.instruments
              ? {
                  instrument: instrument().id,
                  speed: settings.get().speed,
                  octave: settings.get().windOctave,
                }
              : {}),
          },
          audio: {
            sampleRate: audio.ctx.sampleRate,
            baseLatency: audio.ctx.baseLatency,
            outputLatency: audio.ctx.outputLatency,
          },
          latencyOffsetMs: game.debug(audio.ctx.currentTime).latencyOffsetMs,
          micSettings: audio.demo ? undefined : mic?.track.getSettings(),
          score: s,
          grade,
          judgments: game.judge.judgments,
        });
        void copyText(text).then((ok) => {
          const status = stages.results.querySelector('[data-id="copy-status"]');
          if (status)
            status.textContent = ok
              ? 'Copied. Paste it into the chat.'
              : 'Could not copy on this browser.';
        });
      });
      R('again').addEventListener('click', () => {
        // each demo run owns an AudioContext: release the finished one before opening another
        if (audio.demo) void audio.adapter.close();
        void begin(audio.demo);
      });
      R('back').addEventListener('click', () => {
        if (audio.demo) void audio.adapter.close();
        adapterToSetup();
      });
    };

    const adapterToSetup = () => {
      if (mic) mic.onMessage = onSetupMessage;
      show('setup');
    };

    /** Starts a play-through with the live mic, or the auto-play demo. */
    const begin = async (demo: boolean) => {
      if (beginInFlight) return;
      beginInFlight = true;
      try {
        const heard = selectedChart();
        // "listen first": the song is played once, then the same notes are asked of the player
        const echo = settings.get().listenFirst ? echoChart(heard) : null;
        const chart = echo ? echo.chart : heard;
        const listen = echo
          ? {
              end: echo.listenEnd,
              tones: planBacking(heard, { metronome: false, guideTone: true }).filter(
                (e) => e.kind === 'tone',
              ),
            }
          : undefined;
        setupStatus.classList.remove('error');
        if (!demo) {
          const m = await startMic();
          if (!m) return;
          const ctx = m.ctx;
          const startAt = ctx.currentTime + 0.6;
          live = { adapter: m, ctx, demo: false };
          runGame(live, chart, latencyOffset(ctx), startAt, listen);
          return;
        }
        // Demo: a synthetic player plays through the same worklet. Stop the live mic so it isn't confusing.
        if (mic) {
          await mic.close();
          mic = null;
          micBtn.disabled = false;
          micBtn.textContent = 'Start mic';
          bleedBtn.disabled = true;
        }
        setupStatus.textContent = `Preparing the demo ${c.demoWho}… 0%`;
        const perf = await renderPerformanceAsync(
          chart,
          c.demoPerformer(),
          { latency: 0, seed: 1 },
          (f) =>
            (setupStatus.textContent = `Preparing the demo ${c.demoWho}… ${Math.round(f * 100)}%`),
        );
        if (disposed) return;
        const synth = await openSyntheticInput(perf.signal, perf.sampleRate, {
          analyzer: analyzerOptionsFromProfile(profile),
          listen: true,
        });
        if (disposed) {
          await synth.close();
          return;
        }
        setupStatus.textContent = '';
        const ctx = synth.ctx;
        const countIn = chart.meta.countInBeats * (60 / chart.meta.bpm);
        const startAt = ctx.currentTime + 0.6;
        const probe = new SongClock(ctx);
        probe.start(-countIn, startAt);
        live = { adapter: synth, ctx, demo: true };
        runGame(live, chart, 0, startAt, listen);
        synth.start(probe.toSourceTime(perf.songStart));
      } catch (err) {
        setupStatus.textContent = err instanceof Error ? err.message : String(err);
        setupStatus.classList.add('error');
      } finally {
        beginInFlight = false;
      }
    };

    S<HTMLButtonElement>('play').addEventListener('click', () => void begin(false));
    S<HTMLButtonElement>('demo').addEventListener('click', () => void begin(true));

    if (!workletSupported()) {
      // the microphone path and the demo both run on the AudioWorklet
      micBtn.disabled = true;
      S<HTMLButtonElement>('play').disabled = true;
      S<HTMLButtonElement>('demo').disabled = true;
      setupStatus.textContent = `This browser lacks AudioWorklet support, so ${c.mode} cannot run here.`;
    } else if (!micSupported()) {
      micBtn.disabled = true;
      S<HTMLButtonElement>('play').disabled = true;
      setupStatus.textContent = 'This browser has no microphone access. The demo still works.';
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(setupRaf);
      cancelAnimationFrame(playRaf);
      backing?.stop();
      void mic?.close();
      if (live?.demo) void live.adapter.close();
    };
  };

function formatDebug(d: DebugInfo, now: number, demo: boolean): string {
  const fmt = (v: number | null, digits = 1, unit = '') =>
    v === null ? '–' : `${v.toFixed(digits)}${unit}`;
  return [
    `time      ${now.toFixed(2)} s${demo ? '   (auto-play demo)' : ''}`,
    `freq      ${fmt(d.hz, 1, ' Hz')}   ${d.note ?? '–'} ${d.cents === null ? '' : formatCents(d.cents)}`,
    `target    ${d.target ?? '–'}   off by ${d.deviation === null ? '–' : formatCents(d.deviation)}   octaves ${d.octaves === null ? '–' : d.octaves}`,
    `clarity   ${d.clarity.toFixed(2)}   level ${d.levelDb.toFixed(1)} dB   ${d.voiced ? 'VOICED ✓' : 'not counted'}`,
    `frames    ${d.frameRate}/s   age ${d.frameAge === null ? '–' : Math.round(d.frameAge * 1000)} ms   offset ${d.latencyOffsetMs.toFixed(0)} ms`,
  ].join('\n');
}
