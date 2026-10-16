import {
  CalibrationStore,
  EnrollmentSession,
  MAX_SEED,
  type MelodySpec,
  MELODY_LEVELS,
  SCALES,
  SongClock,
  TimbreModelStore,
  chartChords,
  chartEnd,
  chordShapesFor,
  chordSongId,
  defaultOffsetFromLatencies,
  generateChordSong,
  generateGroove,
  generateMelody,
  guitarChart,
  guitarFamily,
  hashSeed,
  getProfile,
  grooveId,
  isSeed,
  letterGrade,
  melodyId,
  melodyScalesFor,
  randomSeed,
  seedForDifficulty,
  rescaleChart,
  songsFor,
  isPluckChart,
  withPluckPitches,
  type Chart,
  type GrooveProfile,
  type InstrumentProfile,
  type MelodyLevel,
  type ScaleId,
  VARIATIONS,
  VARIATION_LABELS,
  applyPart,
  callResponseChart,
  echoChart,
  songParts,
  varyChart,
  type Variation,
  type TimbreModel,
} from '@lineup/core';
import {
  analyzerOptionsFromProfile,
  detectClickBleed,
  workletSupported,
  type AnalyzerMessage,
  type InputAdapter,
} from '@lineup/input';
import { micSupported, openMic, openSyntheticInput, type MicSession } from '@lineup/input/mic';
import { createRenderer, drawMeter, fitCanvas } from '@lineup/render';
import { renderPerformanceAsync, type Performer } from '@lineup/sim';
import { scheduleClicks } from '../audio';
import { buildInfoText } from '../build-info';
import { copyText } from '../clipboard';
import {
  planAllBacking,
  playBacking,
  rhythmTones,
  type BackingEvent,
  type BackingHandle,
} from '../game/backing';
import { BeatlineGame, HitMonitor, formatHits } from '../game/beatline-game';
import { enrollMessage } from '../game/enroll-messages';
import { formatSessionLog } from '../game/session-log';
import { songSummary } from '../game/song-info';
import { mountBackingControls } from '../backing-controls';
import { HitStepGame } from '../game/hit-step-game';
import { StepGame } from '../game/step-game';
import {
  hitEngine,
  pitchEngine,
  showStepResults,
  startStepRun,
  type StepEngine,
} from '../step-run';
import { ScoreStore, describeBest, scoreKey } from '../scores';
import { UserSongStore, userSongsFor } from '../user-songs';
import { starsBySong } from '../scoreboard';
import { grantMilestones } from '../milestones';
import { hashParam } from '../courses';
import { dailyFor, dailyKey, wantsDaily, type DailyGame } from '../daily';
import { ProgressStore } from '../progress';
import { jingleFor, playJingle } from '../game/jingle';
import { playResultFor, rewardHtml } from '../game/reward';
import { SettingsStore, nextSpeed, safeLocalStorage } from '../settings';
import {
  RANDOM_CHORDS,
  RANDOM_GROOVE,
  RANDOM_WALTZ,
  RANDOM_MELODY,
  fillTargetMenu,
} from '../song-menu';
import { callSignal } from '../call-response';
import {
  defaultSongId,
  loadPicker,
  mountPickerControls,
  rebuildPicker,
  savePicker,
} from '../song-picker';
import { TourStore, mountTour } from '../tour';
import type { Screen } from '../router';

/** What differs between the hit-based games (Beatline, Strumline); everything else is shared. */
export interface HitScreenConfig {
  mode: 'Beatline' | 'Strumline' | 'Bassline';
  /** Page heading and its small subtitle. */
  title: string;
  subtitle: string;
  /** Profiles offered, in menu order. */
  modes: { id: string; label: string; note: string }[];
  /** Prefix of this screen's keys in the saved settings. */
  keyPrefix: string;
  /** Shown under the mic meter before anything is played. */
  micPrompt: string;
  /** What to say about the metronome and the mic hearing the speaker. */
  bleedWarning: string;
  /** The synthetic player for the auto-play demo, and the timbre model it implies (null if none). */
  demo: (
    profile: InstrumentProfile,
    options?: { pitched: boolean },
  ) => { performer: Performer; model: TimbreModel | null };
  /** Strumline: offer chord checking and a practice speed. */
  strum?: boolean;
  /**
   * Bassline: single plucked notes judged by pitch and timing at all times, with a practice speed
   * and a drum loop, but no chords and no listening first.
   */
  plucked?: boolean;
}

const template = (c: HitScreenConfig) => `
  <p><a href="#/">← Back</a></p>
  <h1>${c.title} <small>${c.subtitle}</small></h1>
  <div data-id="stage-setup"></div>
  <div data-id="stage-play" hidden></div>
  <div data-id="stage-results" hidden></div>
`;

const setup = (c: HitScreenConfig) => `
  <div class="banner warn">
    <strong>Use headphones</strong> ${c.bleedWarning}
  </div>

  <section class="panel">
    <h2 class="step">Game</h2>
    <div class="row"><label>Mode <select data-id="mode"></select></label></div>
    <div data-id="song-filters"></div>
    <div class="row">
      <label>Song <select data-id="song"></select></label>
      <label>Version <select data-id="variation"></select></label>
      <label class="check" data-id="listen-label" hidden><input type="checkbox" data-id="listen" /> Listen first, then play it back</label>
      <label class="check" data-id="call-label" hidden><input type="checkbox" data-id="call" /> Call and response: hear a bar, play it back, bar by bar</label>
      <label class="check" data-id="blind-label" hidden><input type="checkbox" data-id="blind" /> Unseen: hide the notes on your turn</label>
      <label data-id="part-label" hidden>Part <select data-id="part"></select></label>
    </div>
    <div class="row" data-id="challenge" hidden>
      <label data-id="challenge-scale-label">Scale <select data-id="challenge-scale"></select></label>
      <label>Level <select data-id="challenge-level"></select></label>
      <label>Seed <input data-id="challenge-seed" type="number" min="0" max="${MAX_SEED}" step="1" inputmode="numeric" /></label>
      <label>Aim for <select data-id="challenge-target"></select></label>
      <button data-id="challenge-new">New song</button>
    </div>
    <p data-id="mode-note"></p>
    <p data-id="song-info"></p>
    <p data-id="best"></p>
  </section>

  <section class="panel">
    <h2 class="step">Microphone</h2>
    <div class="row">
      <button data-id="mic-start">Start mic</button>
    </div>
    <canvas class="meter" data-id="meter" role="img" aria-label="Live microphone level"></canvas>
    <p class="status" data-id="advice" role="status">${c.micPrompt}</p>
    <details data-id="monitor-box">
      <summary>Hit monitor and checks <span class="muted">(for troubleshooting)</span></summary>
      <div class="row">
        <button data-id="leak-check" disabled>Check for click leak</button>
        <button data-id="copy-hits" disabled>Copy hit log</button>
      </div>
      <pre class="debug" data-id="monitor">–</pre>
      <p class="status" data-id="leak-result" role="status"></p>
    </details>
  </section>

  <section class="panel" data-id="enroll-panel">
    <h2 class="step">Your sounds</h2>
    <p data-id="model-status"></p>
    <div class="row">
      <button data-id="enroll-start" disabled>Teach it my sounds</button>
      <button data-id="enroll-clear" hidden>Forget my sounds</button>
    </div>
    <div data-id="enroll-run" hidden>
      <div class="enroll-prompt" data-id="enroll-prompt"></div>
      <div class="strip" data-id="enroll-dots"></div>
      <p class="status" data-id="enroll-msg" role="status"></p>
      <button data-id="enroll-cancel">Cancel</button>
    </div>
  </section>

  <section class="panel">
    <h2 class="step">Options</h2>
    <div class="row" data-id="strum-opts" ${c.strum || c.plucked ? '' : 'hidden'}>
      <label>Speed
        <select data-id="speed">
          <option value="0.5">50%</option>
          <option value="0.65">65%</option>
          <option value="0.8">80%</option>
          <option value="1">100%</option>
        </select>
      </label>
    </div>
    <label class="check" data-id="chords-opt" ${c.strum ? '' : 'hidden'}><input type="checkbox" data-id="opt-chords" /> Also check the chords (experimental; otherwise only the timing counts)</label>
    <label class="check" data-id="pitch-opt" hidden><input type="checkbox" data-id="opt-pitch" /> Also check the pitch of each plucked note (experimental; otherwise only the timing counts)</label>
    <div data-id="backing-box" ${c.strum || c.plucked ? '' : 'hidden'}></div>
    <label class="check" data-id="step-label"><input type="checkbox" data-id="opt-step" /> Beginner: one step at a time, no timing (the auto-play demo still plays the normal game)</label>
    <label class="check"><input type="checkbox" data-id="opt-metronome" /> Metronome clicks (needs headphones)</label>
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
  <pre class="debug" data-id="debug" hidden></pre>
`;

type GameAudio = {
  adapter: InputAdapter;
  ctx: AudioContext;
  demo: boolean;
  model: TimbreModel | null;
};

export const createHitScreen =
  (c: HitScreenConfig): Screen =>
  (root) => {
    root.innerHTML = template(c);
    mountTour(root, c.mode.toLowerCase(), new TourStore(safeLocalStorage()));
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const el = root.querySelector<T>(`[data-id="${id}"]`);
      if (!el) throw new Error(`missing [data-id=${id}]`);
      return el;
    };
    const stages = { setup: $('stage-setup'), play: $('stage-play'), results: $('stage-results') };
    const show = (name: keyof typeof stages) => {
      for (const [k, el] of Object.entries(stages)) el.hidden = k !== name;
      // the first-time tip is for the set-up page: while playing the stage gets the whole screen
      root.querySelector('[data-id=tour]')?.toggleAttribute('hidden', name !== 'setup');
    };

    const settings = new SettingsStore(safeLocalStorage());
    const calibration = new CalibrationStore(safeLocalStorage());
    const scores = new ScoreStore(safeLocalStorage());
    const progress = new ProgressStore(safeLocalStorage());
    const mine = new UserSongStore(safeLocalStorage());
    const models = new TimbreModelStore(() => safeLocalStorage() ?? undefined);

    // opened from today's challenge: pick its game mode and its random song (the same for everyone today)
    const dailyGame: DailyGame = c.strum ? 'strumline' : 'beatline';
    if (wantsDaily(location.hash)) {
      const profileId = c.strum ? 'ukulele-strum' : 'clap';
      settings.update({
        challenge: dailyFor(dailyGame).spec,
        variation: 'original',
        songs: {
          ...settings.get().songs,
          [`${c.keyPrefix}-mode`]: profileId,
          [`${c.keyPrefix}:${profileId}`]: c.strum ? RANDOM_CHORDS : RANDOM_GROOVE,
        },
      });
    }

    // opened from a learning path step: choose its sound set and song
    {
      const wantedMode = hashParam(location.hash, 'mode');
      const wantedSong = hashParam(location.hash, 'song');
      const mode = c.modes.some((m) => m.id === wantedMode) ? wantedMode! : null;
      if (mode || wantedSong) {
        const profileId = mode ?? settings.get().songs[`${c.keyPrefix}-mode`] ?? c.modes[0]!.id;
        const songs = settings.get().songs;
        // a lesson is played whole and as written, or its stars would not count toward the path
        if (wantedSong) {
          settings.update({
            variation: 'original',
            stepMode: false,
            ...(c.strum
              ? { speed: 1, checkChords: false, checkPitch: false }
              : { listenFirst: false }),
          });
        }
        settings.update({
          songs: {
            ...songs,
            ...(mode ? { [`${c.keyPrefix}-mode`]: mode } : {}),
            ...(wantedSong ? { [`${c.keyPrefix}:${profileId}`]: wantedSong } : {}),
          },
        });
      }
    }

    /** The guitar plays the ukulele's songs and generators, moved onto its own strings. */
    const guitar = (): boolean => guitarFamily(profile.id) !== null;
    const generatorProfile = (): string => (guitar() ? 'ukulele-strum' : profile.id);
    const forInstrument = (chart: Chart): Chart =>
      guitar() ? guitarChart(chart, profile.id) : chart;
    /** Every song in the menu: the built-in ones and the player's own. */
    const menuSongs = () => [
      ...songsFor(profile.id),
      ...userSongsFor(generatorProfile(), mine).map((s) => ({
        ...s,
        chart: forInstrument(s.chart),
      })),
    ];

    let profile: InstrumentProfile = getProfile(
      c.modes.some((m) => m.id === settings.get().songs[`${c.keyPrefix}-mode`])
        ? settings.get().songs[`${c.keyPrefix}-mode`]!
        : c.modes[0]!.id,
    );
    let model: TimbreModel | null = null;
    let monitor = new HitMonitor(profile, null);
    let enrolling: EnrollmentSession | null = null;
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
    let leakTest: number[] | null = null;

    // ------------------------------------------------------------------ setup

    stages.setup.innerHTML = setup(c);
    const S = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const el = stages.setup.querySelector<T>(`[data-id="${id}"]`);
      if (!el) throw new Error(`missing setup [data-id=${id}]`);
      return el;
    };
    const micBtn = S<HTMLButtonElement>('mic-start');
    const leakBtn = S<HTMLButtonElement>('leak-check');
    const copyHitsBtn = S<HTMLButtonElement>('copy-hits');
    const modeSel = S<HTMLSelectElement>('mode');
    const songSel = S<HTMLSelectElement>('song');
    const meter = S<HTMLCanvasElement>('meter');
    const setupStatus = S('setup-status');
    const enrollBtn = S<HTMLButtonElement>('enroll-start');
    const clearBtn = S<HTMLButtonElement>('enroll-clear');

    const current = settings.get();
    S<HTMLInputElement>('opt-metronome').checked = current.metronome;
    S<HTMLInputElement>('opt-debug').checked = current.debug;
    const chordsBox = S<HTMLInputElement>('opt-chords');
    const speedSel = S<HTMLSelectElement>('speed');
    chordsBox.checked = current.checkChords;
    const pitchBox = S<HTMLInputElement>('opt-pitch');
    pitchBox.checked = current.checkPitch;
    speedSel.value = String(current.speed);
    mountBackingControls(S('backing-box'), settings, { music: c.strum === true });
    const stepBox = S<HTMLInputElement>('opt-step');
    stepBox.checked = current.stepMode;
    for (const m of c.modes) modeSel.add(new Option(m.label, m.id));
    modeSel.value = profile.id;

    const classCount = () => profile.timbreClasses?.length ?? 1;

    // the random song: its spec lives in the settings, and the seed is shown so it can be replayed
    const challengeRow = S('challenge');
    const scaleSel = S<HTMLSelectElement>('challenge-scale');
    const levelSel = S<HTMLSelectElement>('challenge-level');
    const seedInput = S<HTMLInputElement>('challenge-seed');
    for (const level of MELODY_LEVELS)
      levelSel.add(new Option(level[0]!.toUpperCase() + level.slice(1), level));
    /** The random song chosen in the menu, built for the current spec (once per spec), or null. */
    let randomCache: { id: string; chart: Chart } | null = null;
    /** The random song the menu has chosen, as a pair of its id and a builder for any spec. */
    const randomKind = (
      spec: MelodySpec,
    ): { id: string; build: (spec: MelodySpec) => Chart } | null => {
      if (songSel.value === RANDOM_CHORDS || songSel.value === RANDOM_WALTZ) {
        const waltz = songSel.value === RANDOM_WALTZ;
        const withWaltz = (s: MelodySpec) => (waltz ? { ...s, waltz } : s);
        return {
          id: chordSongId(withWaltz(spec)),
          build: (s) => generateChordSong(withWaltz(s)),
        };
      }
      if (songSel.value === RANDOM_GROOVE) {
        return {
          id: grooveId(profile.id as GrooveProfile, spec),
          build: (s) => generateGroove(profile.id as GrooveProfile, s),
        };
      }
      if (songSel.value === RANDOM_MELODY) {
        return {
          id: melodyId(generatorProfile(), spec),
          build: (s) => generateMelody(generatorProfile(), s),
        };
      }
      return null;
    };
    const randomEntry = (): { id: string; chart: Chart } | null => {
      const spec = settings.get().challenge;
      const kind = randomKind(spec);
      if (!kind) return null;
      if (randomCache?.id !== kind.id)
        randomCache = { id: kind.id, chart: forInstrument(kind.build(spec)) };
      return randomCache;
    };
    const showChallenge = () => {
      const spec = settings.get().challenge;
      scaleSel.replaceChildren();
      for (const id of melodyScalesFor(generatorProfile()))
        scaleSel.add(new Option(SCALES[id].label, id));
      if (!melodyScalesFor(generatorProfile()).includes(spec.scale)) {
        settings.update({ challenge: { ...spec, scale: melodyScalesFor(generatorProfile())[0]! } });
      }
      const now = settings.get().challenge;
      scaleSel.value = now.scale;
      levelSel.value = now.level;
      seedInput.value = String(now.seed);
      challengeRow.hidden = randomEntry() === null;
      S('challenge-scale-label').hidden = songSel.value !== RANDOM_MELODY;
    };

    /** Best-score bucket: the song, and for Strumline the practice speed and whether chords count. */
    const bestKey = () =>
      scoreKey(
        profile.id,
        randomEntry()?.id ?? songSel.value,
        `${c.strum || c.plucked ? `x${settings.get().speed}${c.strum && settings.get().checkChords ? '+chords' : ''}${c.strum && pitchMode() ? '+pitch' : ''}` : ''}${
          settings.get().variation === 'original' ? '' : `|${settings.get().variation}`
        }${partIdx >= 0 ? `|part${partIdx + 1}` : ''}${settings.get().stepMode ? '|step' : ''}${listening() ? `|echo${blind() ? '|blind' : ''}` : ''}${calling() ? '|call' : ''}`,
      );
    const refreshSong = () => {
      syncParts();
      // a random song has no fixed title to find in the menu: say which one this is
      const chart = songChart();
      S('pitch-opt').hidden = !(c.strum && isPluckChart(wholeSong()));
      S('song-info').textContent = randomEntry()
        ? `${chart.meta.title} · ${songSummary(chart)}`
        : songSummary(chart);
      S('best').textContent = describeBest(scores.best(bestKey()));
    };

    const picker = loadPicker(safeLocalStorage());
    /** Re-reads everything that depends on the chosen mode. */
    const applyMode = () => {
      const songs = menuSongs();
      const stars = starsBySong(scores.entries(), profile.id);
      const random = c.plucked
        ? []
        : generatorProfile() === 'ukulele-strum'
          ? [
              { value: RANDOM_CHORDS, label: '🎲 Random chord song' },
              { value: RANDOM_WALTZ, label: '🎲 Random waltz (3/4)' },
              { value: RANDOM_MELODY, label: '🎲 Random melody (picked)' },
            ]
          : [{ value: RANDOM_GROOVE, label: '🎲 Random groove' }];
      const saved = settings.get().songs[`${c.keyPrefix}:${profile.id}`] ?? null;
      picker.random = saved !== null && random.some((r) => r.value === saved);
      /** Refills the menu from the filters, keeping the chosen song when it is still on offer. */
      const rebuild = (wanted: string | null, reveal = false, kind = false) => {
        const changed = rebuildPicker(
          songSel,
          { songs, stars: (id) => stars.get(id) ?? null, random, state: picker },
          wanted,
          // a new player starts on the first step of this game's learning path; a new kind, on its first song
          kind
            ? null
            : picker.random
              ? (random[0]?.value ?? null)
              : defaultSongId(profile.id, songs, profile.id),
          reveal,
        );
        if (changed) songSel.dispatchEvent(new Event('change'));
      };
      mountPickerControls(S('song-filters'), picker, {
        hasRandom: random.length > 0,
        songs,
        onChange: (what) => {
          savePicker(safeLocalStorage(), picker);
          // choosing a kind of song starts a new list, on its first song
          rebuild(what === 'kind' ? null : songSel.value, false, what === 'kind');
        },
      });
      rebuild(saved, true);
      showChallenge();
      S('mode-note').textContent = c.modes.find((m) => m.id === profile.id)?.note ?? '';
      model =
        classCount() > 1
          ? models.load(
              profile.id,
              profile.timbreClasses!.map((c) => c.id),
            )
          : null;
      monitor = new HitMonitor(profile, model);
      S('enroll-panel').hidden = classCount() < 2;
      refreshModelStatus();
      refreshSong();
      if (mic) mic.onMessage = onSetupMessage;
    };

    const refreshModelStatus = () => {
      const needs = classCount() > 1;
      S('model-status').textContent = !needs
        ? ''
        : model
          ? `Your sounds are saved (${model.classes.map((c) => c.id).join(', ')}). The monitor above shows which lane each hit lands in.`
          : `Not taught yet: ${profile.timbreClasses!.map((c) => c.label).join(' and ')} cannot be told apart. Start the mic, then tap “Teach it my sounds”.`;
      clearBtn.hidden = !model;
      enrollBtn.disabled = !mic || enrolling !== null;
    };

    const refreshCalibration = () => {
      const rec = mic ? calibration.load(mic.track.getSettings().deviceId || 'default') : null;
      S('cal-status').textContent = rec
        ? `Timing calibration: ${rec.offsetMs.toFixed(0)} ms (${rec.quality}).`
        : mic
          ? 'Not calibrated: using the browser’s latency estimate. Calibrating makes timing fairer.'
          : 'Start the mic to load your saved timing calibration.';
    };

    modeSel.addEventListener('change', () => {
      if (enrolling) cancelEnroll();
      profile = getProfile(modeSel.value);
      settings.update({ songs: { ...settings.get().songs, [`${c.keyPrefix}-mode`]: profile.id } });
      applyMode();
    });
    const variationSel = S<HTMLSelectElement>('variation');
    for (const v of VARIATIONS) variationSel.add(new Option(VARIATION_LABELS[v], v));
    variationSel.value = settings.get().variation;
    variationSel.addEventListener('change', () => {
      settings.update({ variation: variationSel.value as Variation });
      refreshSong();
      // an easier or harder version can use other chords: an open mic must listen for those
      void reopenMicIfNeeded();
    });
    songSel.addEventListener('change', () => {
      settings.update({
        songs: { ...settings.get().songs, [`${c.keyPrefix}:${profile.id}`]: songSel.value },
      });
      showChallenge();
      refreshSong();
    });
    const updateChallenge = (patch: Partial<ReturnType<typeof settings.get>['challenge']>) => {
      settings.update({ challenge: { ...settings.get().challenge, ...patch } });
      showChallenge();
      refreshSong();
      // a new random song can use other chords: an open mic must listen for those
      void reopenMicIfNeeded();
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
      const kind = randomKind(spec);
      const variation = settings.get().variation;
      // rate each candidate the way it will be played, in the chosen version
      const played = (seed: number): Chart => {
        const next = { ...spec, seed };
        const k = randomKind(next)!;
        return varyChart(k.build(next), variation, hashSeed(k.id));
      };
      updateChallenge({
        seed: target !== null && kind ? seedForDifficulty(played, target) : randomSeed(),
      });
    });
    S<HTMLInputElement>('opt-metronome').addEventListener('change', (e) =>
      settings.update({ metronome: (e.target as HTMLInputElement).checked }),
    );
    S<HTMLInputElement>('opt-debug').addEventListener('change', (e) =>
      settings.update({ debug: (e.target as HTMLInputElement).checked }),
    );

    // ------------------------------------------------------------ mic + monitor

    const onSetupMessage = (m: AnalyzerMessage) => {
      const hit = monitor.push(m);
      if (!hit) return;
      if (leakTest) leakTest.push(hit.event.time);
      if (enrolling) enrollHit(hit.event);
    };

    /** The open in flight, shared by every caller: a second open would leak the first session. */
    let micOpening: Promise<MicSession | null> | null = null;
    /** Set when a demo starts: a mic open still pending must then close itself instead of landing. */
    let demoClaimed = false;
    /** The analyzer settings the open mic was built with (see analyzerKey). */
    let micKey = '';

    /** Strumline with chord checking on: the analyzer is told which chords the song uses. */
    const wantChords = () => c.strum === true && settings.get().checkChords;
    const analyzerExtras = () =>
      wantChords() ? { chords: chordShapesFor(profile, chartChords(songChart())) } : {};
    /** What the running analyzer was built for; when it changes the mic must be reopened. */
    const analyzerKey = () =>
      `${profile.id}|${wantChords() ? chartChords(songChart()).join(',') : ''}`;

    const openMicSession = async (): Promise<MicSession | null> => {
      const forKey = analyzerKey();
      micBtn.disabled = true;
      setupStatus.textContent = 'Opening microphone…';
      try {
        const opened = await openMic(
          undefined,
          0,
          analyzerOptionsFromProfile(profile, analyzerExtras()),
        );
        if (disposed) {
          await opened.close();
          return null;
        }
        if (demoClaimed) {
          // a demo started while the mic was opening and owns the audio now
          await opened.close();
          micBtn.disabled = false;
          return null;
        }
        if (forKey !== analyzerKey()) {
          // the mode, song or chord option changed while the mic was opening: its analyzer has the old settings
          await opened.close();
          return openMicSession();
        }
        mic = opened;
        micKey = forKey;
        mic.onMessage = onSetupMessage;
        micBtn.textContent = 'Mic on';
        leakBtn.disabled = false;
        copyHitsBtn.disabled = false;
        setupStatus.textContent = '';
        refreshCalibration();
        refreshModelStatus();
        return mic;
      } catch (err) {
        micBtn.disabled = false;
        setupStatus.textContent = err instanceof Error ? err.message : String(err);
        setupStatus.classList.add('error');
        return null;
      }
    };

    const startMic = (): Promise<MicSession | null> => {
      if (mic) return Promise.resolve(mic);
      if (!micOpening) demoClaimed = false; // an explicit mic request takes the audio back
      micOpening ??= openMicSession().finally(() => {
        micOpening = null;
      });
      return micOpening;
    };
    micBtn.addEventListener('click', () => void startMic());
    copyHitsBtn.addEventListener('click', () => {
      if (!mic) return;
      const text = `Lineup hit log: ${profile.id}\n${buildInfoText()}\n${navigator.userAgent}\n\n${formatHits(monitor, mic.ctx.currentTime)}`;
      void copyText(text).then((ok) => {
        setupStatus.classList.toggle('error', !ok);
        setupStatus.textContent = ok
          ? 'Hit log copied. Paste it into the chat.'
          : 'Could not copy on this browser.';
      });
    });

    // When the mode changes the live worklet must be re-created with the right detector settings.
    const reopenMicIfNeeded = async () => {
      // an open in flight checks its own settings when it lands; a mic that already fits stays
      if (!mic || micKey === analyzerKey()) return;
      // clear the shared reference first: a second mode change during the close must not close it twice
      const old = mic;
      mic = null;
      await old.close();
      micBtn.disabled = false;
      micBtn.textContent = 'Start mic';
      leakBtn.disabled = true;
      copyHitsBtn.disabled = true;
      // a demo that started meanwhile owns the audio; the mic must stay closed
      if (disposed || beginInFlight || demoClaimed) return;
      await startMic();
    };
    modeSel.addEventListener('change', () => void reopenMicIfNeeded());
    songSel.addEventListener('change', () => void reopenMicIfNeeded());
    pitchBox.addEventListener('change', () => {
      settings.update({ checkPitch: pitchBox.checked });
      refreshSong();
    });
    stepBox.addEventListener('change', () => {
      settings.update({ stepMode: stepBox.checked });
      refreshSong();
    });
    chordsBox.addEventListener('change', () => {
      settings.update({ checkChords: chordsBox.checked });
      refreshSong();
      void reopenMicIfNeeded();
    });
    speedSel.addEventListener('change', () => {
      settings.update({ speed: Number(speedSel.value) });
      refreshSong();
    });

    // ------------------------------------------------------------ enrollment

    const dots = () => S('enroll-dots');
    const renderEnroll = () => {
      if (!enrolling) return;
      const cls = enrolling.current;
      S('enroll-prompt').textContent = cls
        ? `${cls.prompt} × ${enrolling.options.perClass}`
        : 'All done';
      dots().innerHTML = enrolling.classes
        .flatMap((c) =>
          Array.from({ length: enrolling!.options.perClass }, (_, i) => {
            const done = i < enrolling!.countFor(c.id);
            return `<span class="cell ${done ? 'perfect' : 'pending'}" title="${c.label}"></span>`;
          }),
        )
        .join('');
    };

    function enrollHit(event: Parameters<EnrollmentSession['add']>[0]) {
      const session = enrolling!;
      const cls = session.current;
      const outcome = session.add(event);
      const msg = enrollMessage(
        outcome,
        cls,
        cls ? session.countFor(cls.id) : 0,
        session.options.perClass,
      );
      const el = S('enroll-msg');
      el.textContent = msg.text;
      el.className = `status ${msg.ok ? 'ok' : 'error'}`;
      renderEnroll();
      if (session.done) finishEnroll();
    }

    function finishEnroll() {
      const session = enrolling!;
      enrolling = null;
      S('enroll-run').hidden = true;
      try {
        const built = session.build();
        model = built.model;
        const saved = models.save(profile.id, model);
        monitor.model = model;
        const el = S('enroll-msg');
        el.textContent = '';
        S('model-status').textContent =
          `Learned: ${profile.timbreClasses!.map((c) => c.label).join(', ')}.` +
          (saved ? ' Saved on this device.' : ' (Could not save: browser storage is blocked.)') +
          (built.warnings.length ? ` Warning: ${built.warnings.join(' ')}` : '');
        S('model-status').classList.toggle('error', built.warnings.length > 0);
      } catch (err) {
        S('model-status').textContent = err instanceof Error ? err.message : String(err);
      }
      clearBtn.hidden = !model;
      enrollBtn.disabled = !mic;
    }

    function cancelEnroll() {
      enrolling = null;
      S('enroll-run').hidden = true;
      enrollBtn.disabled = !mic;
    }

    enrollBtn.addEventListener('click', () => {
      if (!mic) return;
      enrolling = new EnrollmentSession(profile.timbreClasses!);
      S('enroll-run').hidden = false;
      S('enroll-msg').textContent = 'Go ahead.';
      S('enroll-msg').className = 'status';
      S('model-status').classList.remove('error');
      enrollBtn.disabled = true;
      renderEnroll();
    });
    S('enroll-cancel').addEventListener('click', cancelEnroll);
    clearBtn.addEventListener('click', () => {
      models.clear(profile.id);
      model = null;
      monitor.model = null;
      refreshModelStatus();
    });

    // ------------------------------------------------------------ click leak

    leakBtn.addEventListener('click', async () => {
      if (!mic) return;
      leakBtn.disabled = true;
      const out = S('leak-result');
      out.className = 'status';
      const ctx = mic.ctx;

      out.textContent = 'Stay quiet… listening to the room.';
      const baseline: number[] = [];
      leakTest = baseline;
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      leakTest = null;
      if (baseline.length > 0) {
        out.textContent =
          'I already hear hits (you, a TV, a fan). Stay quiet and run the check again.';
        out.classList.add('error');
        leakBtn.disabled = false;
        return;
      }

      out.textContent = 'Still quiet… playing four clicks.';
      const onsets: number[] = [];
      leakTest = onsets;
      const first = ctx.currentTime + 0.3;
      const clicks = [0, 0.5, 1, 1.5].map((d) => first + d);
      scheduleClicks(ctx, clicks);
      await new Promise<void>((resolve) => setTimeout(resolve, 2600));
      leakTest = null;
      const audible = clicks.map((t) => t + (ctx.outputLatency || 0));
      const r = detectClickBleed(onsets, audible);
      out.textContent = r.bleeding
        ? `⚠ Your mic hears the clicks (${Math.round(r.fraction * 100)}% of them). Use headphones or turn the volume down, or the click will score for you.`
        : '✓ No click leak detected.';
      out.classList.toggle('error', r.bleeding);
      leakBtn.disabled = false;
    });

    // ----------------------------------------------------------- setup refresh

    const setupTick = () => {
      setupRaf = requestAnimationFrame(setupTick);
      if (!stages.play.hidden || !stages.results.hidden) return;
      if (meter.clientWidth > 0 && mic) {
        drawMeter(meter, monitor.levelDb, monitor.peakDb, {
          bar: '#118ab2',
          peak: '#ffd166',
          hot: '#ef476f',
        });
      }
      if (mic) S('monitor').textContent = formatHits(monitor, mic.ctx.currentTime);
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

    let stepStop: (() => void) | null = null;
    const stopPlay = () => {
      stepStop?.();
      stepStop = null;
      cancelAnimationFrame(playRaf);
      backing?.stop();
      backing = null;
    };

    const runGame = (
      audio: GameAudio,
      chart: Chart,
      offset: number,
      startAt: number,
      listen: {
        end: number;
        tones: BackingEvent[];
        /** Call and response: when the player listens and when they answer, in song time. */
        calls?: { from: number; to: number }[];
        responses?: { from: number; to: number }[];
      } = { end: 0, tones: [] },
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
      const game = new BeatlineGame({
        chart,
        profile,
        clock,
        latencyOffset: offset,
        model: audio.model,
        ...(pitchMode()
          ? {
              pitched: c.plucked
                ? profile
                : getProfile(
                    guitar()
                      ? `guitar-note${guitarFamily(profile.id)!.tuning.suffix}`
                      : 'ukulele-note',
                  ),
            }
          : {}),
      });
      adapter.onMessage = (m) => game.handleMessage(m);
      backing = playBacking(
        ctx,
        clock,
        [
          ...planAllBacking(chart, {
            metronome: opts.metronome,
            guideTone: false,
            accompaniment: c.plucked ? 'off' : settings.get().accompaniment,
            drums: c.strum || c.plucked ? settings.get().drums : 'off',
          }),
          ...listen.tones,
        ].sort((a, b) => a.songTime - b.songTime),
      );
      const renderer = createRenderer(profile.renderer);
      const endAt = chartEnd(chart) + 0.9;
      let lastDebug = 0;
      let finished = false;

      const finish = () => {
        if (finished) return;
        finished = true;
        stopPlay();
        game.finish();
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
        // unseen: after the listening part the notes are hidden (the lanes and now line stay), so the
        // rhythm is played from memory
        const view = game.view();
        const hideNotes = blind() && listen.end > 0 && now >= listen.end - spb;
        renderer.draw(g, { width, height }, hideNotes ? { ...view, notes: [] } : view);

        const s = game.session.score;
        P('score').textContent = String(s.score);
        P('combo').textContent = String(s.combo);
        P('mult').textContent = s.multiplier > 1 ? `×${s.multiplier.toFixed(1)}` : '';
        P('acc').textContent = s.judged ? `${Math.round(s.accuracy * 100)}%` : '–';

        if (now < 0) {
          overlay.textContent = String(Math.max(1, Math.ceil(-now / spb - 1e-6)));
          overlay.classList.add('on');
        } else if (listen.end > 0 && now < listen.end - spb) {
          overlay.textContent = 'Listen…';
          overlay.classList.add('on');
        } else if (listen.end > 0 && now < listen.end) {
          overlay.textContent = 'Your turn!';
          overlay.classList.add('on');
        } else if (callSignal(listen, now, spb)) {
          overlay.textContent = callSignal(listen, now, spb)!;
          overlay.classList.add('on');
        } else {
          overlay.classList.remove('on');
        }

        if (opts.debug && ctx.currentTime - lastDebug > 0.1) {
          lastDebug = ctx.currentTime;
          debugEl.textContent = formatHits(game.monitor, ctx.currentTime, {
            songTime: now,
            offsetMs: offset * 1000,
            strays: game.strays,
          });
        }
        if (now > endAt) finish();
      };
      playRaf = requestAnimationFrame(tick);
    };

    /** Whether the song just played is today's challenge, played whole and as written. */
    const isDaily = (id: string): boolean =>
      id === dailyFor(dailyGame).id && settings.get().variation === 'original' && partIdx < 0;

    const showResults = (game: BeatlineGame, chart: Chart, audio: GameAudio) => {
      const s = game.session.score;
      const grade = letterGrade(s.accuracy);
      // the auto-play demo is a synthetic player: it never sets a high score
      const best = audio.demo
        ? null
        : scores.record(bestKey(), { score: s.score, accuracy: s.accuracy, grade });
      refreshSong(); // the setup screen's best-score line now shows this result
      // stars, XP and trophies: the demo earns none
      const outcome = audio.demo
        ? null
        : progress.recordPlay(
            playResultFor(
              profile.id,
              randomEntry()?.id ?? songSel.value,
              chart,
              s,
              isDaily(randomEntry()?.id ?? songSel.value)
                ? { key: dailyKey(dailyGame) }
                : undefined,
              c.strum || c.plucked ? settings.get().speed : undefined,
            ),
          );
      if (outcome) outcome.newAchievements.push(...grantMilestones(progress, scores.entries()));
      const reward = outcome ? rewardHtml(s.accuracy, outcome) : '';
      const bestLine = audio.demo
        ? 'Demo run: not saved as a score.'
        : best!.isNewBest
          ? 'New best!'
          : describeBest(best!.best);
      const timing = game.judge.judgments
        .filter((j) => j.timingError !== null && j.grade !== 'miss')
        .map((j) => j.timingError!);
      const avg = timing.length ? (timing.reduce((a, b) => a + b, 0) / timing.length) * 1000 : null;
      // a clean run at a practice speed offers the next speed up
      const faster =
        !audio.demo && (c.strum || c.plucked) && s.accuracy >= 0.9
          ? nextSpeed(settings.get().speed)
          : null;
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
          <dt>Extra hits</dt><dd data-id="r-strays">${game.strays}</dd>
          ${
            pitchMode()
              ? `<dt>Wrong note</dt><dd data-id="r-wrongpitch">${game.judge.judgments.filter((j) => j.reason === 'wrong-pitch').length}</dd>`
              : ''
          }
          ${
            c.strum && settings.get().checkChords
              ? `<dt>Wrong chord</dt><dd data-id="r-wrongchord">${game.judge.judgments.filter((j) => j.reason === 'wrong-chord').length}</dd>`
              : ''
          }
          <dt>Timing</dt><dd data-id="r-timing">${avg === null ? '–' : `${avg > 0 ? '+' : ''}${avg.toFixed(0)} ms on average (${avg > 15 ? 'late' : avg < -15 ? 'early' : 'on the beat'})`}</dd>
          <dt>Best combo</dt><dd data-id="r-combo">${s.maxCombo}</dd>
        </dl>
        <div class="strip" data-id="strip">${game.session.statuses
          .map((st, i) => `<span class="cell ${st}" title="${chart.notes[i]?.lane ?? ''}"></span>`)
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
            metronome: settings.get().metronome,
            enrolled: audio.model !== null,
            ...(c.strum || c.plucked
              ? { speed: settings.get().speed, checkChords: settings.get().checkChords }
              : {}),
          },
          audio: {
            sampleRate: audio.ctx.sampleRate,
            baseLatency: audio.ctx.baseLatency,
            outputLatency: audio.ctx.outputLatency,
          },
          latencyOffsetMs: game.latencyOffsetMs,
          micSettings: audio.demo ? undefined : mic?.track.getSettings(),
          score: s,
          grade,
          judgments: game.judge.judgments,
          strays: game.strays,
          hits: formatHits(game.monitor, audio.ctx.currentTime),
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
        if (mic) mic.onMessage = onSetupMessage;
        show('setup');
      });
    };

    /** The chosen song at its own tempo. */
    const wholeSong = (): Chart => {
      const entry = songEntry();
      return varyChart(entry.chart, settings.get().variation, hashSeed(entry.id));
    };
    const songEntry = () => {
      const random = randomEntry();
      const songs = menuSongs();
      return random ?? songs.find((s) => s.id === songSel.value) ?? songs[0]!;
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
      refreshSong();
    });
    /** Strumline: a picked melody is judged by pitch as well as timing when the player asked for it. */
    const pitchMode = (): boolean =>
      c.plucked === true ||
      (c.strum === true && settings.get().checkPitch && isPluckChart(wholeSong()));
    const songChart = (): Chart => {
      const part = applyPart(wholeSong(), partIdx);
      return c.strum && pitchMode() ? withPluckPitches(part) : part;
    };
    // percussion rhythms can be heard first as ticks; a chord song cannot
    const callBox = S<HTMLInputElement>('call');
    S('call-label').hidden = !!(c.strum || c.plucked);
    callBox.checked = settings.get().callResponse;
    const listenBox = S<HTMLInputElement>('listen');
    S('listen-label').hidden = !!(c.strum || c.plucked);
    listenBox.checked = settings.get().listenFirst;
    listenBox.addEventListener('change', () => {
      settings.update({
        listenFirst: listenBox.checked,
        ...(listenBox.checked ? { callResponse: false } : {}),
      });
      callBox.checked = settings.get().callResponse;
      syncBlind();
      refreshSong();
    });
    callBox.addEventListener('change', () => {
      // call and response and listen first are two ways of hearing a rhythm first: one at a time
      settings.update({
        callResponse: callBox.checked,
        ...(callBox.checked ? { listenFirst: false } : {}),
      });
      listenBox.checked = settings.get().listenFirst;
      syncBlind();
      refreshSong();
    });
    const calling = (): boolean => !c.strum && !c.plucked && settings.get().callResponse;
    const listening = (): boolean =>
      !c.strum && !c.plucked && settings.get().listenFirst && !calling();
    const blind = (): boolean => listening() && settings.get().blind;
    const blindBox = S<HTMLInputElement>('blind');
    const syncBlind = () => {
      S('blind-label').hidden = !listening();
    };
    blindBox.checked = settings.get().blind;
    blindBox.addEventListener('change', () => {
      settings.update({ blind: blindBox.checked });
      refreshSong();
    });
    syncBlind();
    /** The chart as played: at the chosen practice speed. */
    const selectedChart = (): Chart =>
      rescaleChart(songChart(), c.strum || c.plucked ? settings.get().speed : 1);

    /**
     * Beginner mode: each step (a note, a chord, a drum sound) is played and shown, and waited for.
     * No clock, no timing. Pitched games (bass) listen for the note; the others for the hit.
     */
    const runStep = (m: MicSession, chart: Chart) => {
      sessionStart = new Date();
      show('play');
      const pitched = c.plucked === true;
      let game: StepGame | HitStepGame;
      let engine: StepEngine;
      if (pitched) {
        // a bass note sounds far below what a small speaker can play: the asked note is played higher
        const lowest = Math.min(
          ...chart.notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch])),
        );
        const octave = lowest < 48 ? Math.ceil((48 - lowest) / 12) * 12 : 0;
        const g = new StepGame(chart, profile);
        game = g;
        engine = pitchEngine(g, octave, 'Play');
      } else {
        const g = new HitStepGame(chart, profile, {
          needChord: c.strum === true && settings.get().checkChords,
        });
        game = g;
        engine = hitEngine(g, new HitMonitor(profile, model), profile);
      }
      stepStop = startStepRun({
        container: stages.play,
        mic: m,
        engine,
        renderer: createRenderer(profile.renderer),
        forward: onSetupMessage,
        onFinish: () => {
          m.onMessage = onSetupMessage;
          refreshSong();
          showStepResults({
            container: stages.results,
            game,
            chart,
            ctx: m.ctx,
            scores,
            progress,
            settings,
            bestKey: bestKey(),
            profileId: profile.id,
            songId: songEntry().id,
            speed: c.strum || c.plucked ? settings.get().speed : undefined,
            onAgain: () => void begin(false),
            onTimed: () => {
              settings.update({ stepMode: false });
              stepBox.checked = false;
              refreshSong();
              void begin(false);
            },
            onBack: () => show('setup'),
          });
          show('results');
        },
        onStop: () => {
          m.onMessage = onSetupMessage;
          show('setup');
        },
      });
    };

    /** Starts a play-through with the live mic, or the auto-play demo. */
    const begin = async (demo: boolean) => {
      if (beginInFlight) return;
      beginInFlight = true;
      try {
        const heard = selectedChart();
        // "listen first": the rhythm is ticked out once, then asked of the player
        const echo = listening() ? echoChart(heard) : null;
        // or bar by bar: each bar is ticked out and then asked of the player
        const call = calling() ? callResponseChart(heard) : null;
        const chart = call ? call.chart : echo ? echo.chart : heard;
        const listen = call
          ? {
              end: 0,
              tones: rhythmTones(call.callChart),
              calls: call.calls,
              responses: call.responses,
            }
          : echo
            ? { end: echo.listenEnd, tones: rhythmTones(heard) }
            : undefined;
        setupStatus.classList.remove('error');
        demoClaimed = demo;
        if (!demo) {
          if (classCount() > 1 && !model) {
            setupStatus.textContent = 'Teach it your sounds first (section 3).';
            setupStatus.classList.add('error');
            return;
          }
          if (settings.get().stepMode) {
            const m = await startMic();
            if (!m) return;
            runStep(m, heard);
            return;
          }
          const m = await startMic();
          if (!m) return;
          const ctx = m.ctx;
          live = { adapter: m, ctx, demo: false, model };
          runGame(live, chart, latencyOffset(ctx), ctx.currentTime + 0.6, listen);
          return;
        }
        if (mic) {
          const old = mic;
          mic = null;
          await old.close();
          micBtn.disabled = false;
          micBtn.textContent = 'Start mic';
          leakBtn.disabled = true;
          copyHitsBtn.disabled = true;
          enrollBtn.disabled = true;
        }
        setupStatus.textContent = 'Preparing the demo player… 0%';
        const { performer, model: demoModel } = c.demo(profile, { pitched: pitchMode() });
        const perf = await renderPerformanceAsync(
          chart,
          performer,
          { latency: 0, jitter: 0.012, seed: 1 },
          (f) => (setupStatus.textContent = `Preparing the demo player… ${Math.round(f * 100)}%`),
        );
        if (disposed) return;
        const synth = await openSyntheticInput(perf.signal, perf.sampleRate, {
          analyzer: analyzerOptionsFromProfile(profile, analyzerExtras()),
          listen: true,
        });
        if (disposed) {
          void synth.close();
          return;
        }
        setupStatus.textContent = '';
        const ctx = synth.ctx;
        const countIn = chart.meta.countInBeats * (60 / chart.meta.bpm);
        const startAt = ctx.currentTime + 0.6;
        const probe = new SongClock(ctx);
        probe.start(-countIn, startAt);
        live = { adapter: synth, ctx, demo: true, model: demoModel };
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

    applyMode();
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
      stepStop?.();
      cancelAnimationFrame(playRaf);
      backing?.stop();
      void mic?.close();
      if (live?.demo) void live.adapter.close();
    };
  };
