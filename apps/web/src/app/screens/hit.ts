import {
  CalibrationStore,
  EnrollmentSession,
  SongClock,
  TimbreModelStore,
  chartChords,
  chartEnd,
  chordShapesFor,
  defaultOffsetFromLatencies,
  getProfile,
  letterGrade,
  rescaleChart,
  songsFor,
  type Chart,
  type InstrumentProfile,
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
import { planBacking, playBacking, type BackingHandle } from '../game/backing';
import { BeatlineGame, HitMonitor, formatHits } from '../game/beatline-game';
import { enrollMessage } from '../game/enroll-messages';
import { formatSessionLog } from '../game/session-log';
import { songSummary } from '../game/song-info';
import { ScoreStore, describeBest, scoreKey } from '../scores';
import { SettingsStore, safeLocalStorage } from '../settings';
import type { Screen } from '../router';

/** What differs between the hit-based games (Beatline, Strumline); everything else is shared. */
export interface HitScreenConfig {
  mode: 'Beatline' | 'Strumline';
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
  demo: (profile: InstrumentProfile) => { performer: Performer; model: TimbreModel | null };
  /** Strumline: offer chord checking and a practice speed. */
  strum?: boolean;
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
    <h2>1. Game</h2>
    <div class="row">
      <label>Mode <select data-id="mode"></select></label>
      <label>Song <select data-id="song"></select></label>
    </div>
    <p data-id="mode-note"></p>
    <p data-id="song-info"></p>
    <p data-id="best"></p>
  </section>

  <section class="panel">
    <h2>2. Microphone &amp; hit monitor</h2>
    <div class="row">
      <button data-id="mic-start">Start mic</button>
      <button data-id="leak-check" disabled>Check for click leak</button>
      <button data-id="copy-hits" disabled>Copy hit log</button>
    </div>
    <canvas class="meter" data-id="meter" role="img" aria-label="Live microphone level"></canvas>
    <p class="status" data-id="advice" role="status">${c.micPrompt}</p>
    <pre class="debug" data-id="monitor">–</pre>
    <p class="status" data-id="leak-result" role="status"></p>
  </section>

  <section class="panel" data-id="enroll-panel">
    <h2>3. Your sounds</h2>
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
    <h2>4. Options</h2>
    <div class="row" data-id="strum-opts" ${c.strum ? '' : 'hidden'}>
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
    const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
      const el = root.querySelector<T>(`[data-id="${id}"]`);
      if (!el) throw new Error(`missing [data-id=${id}]`);
      return el;
    };
    const stages = { setup: $('stage-setup'), play: $('stage-play'), results: $('stage-results') };
    const show = (name: keyof typeof stages) => {
      for (const [k, el] of Object.entries(stages)) el.hidden = k !== name;
    };

    const settings = new SettingsStore(safeLocalStorage());
    const calibration = new CalibrationStore(safeLocalStorage());
    const scores = new ScoreStore(safeLocalStorage());
    const models = new TimbreModelStore(() => safeLocalStorage() ?? undefined);

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
    speedSel.value = String(current.speed);
    for (const m of c.modes) modeSel.add(new Option(m.label, m.id));
    modeSel.value = profile.id;

    const classCount = () => profile.timbreClasses?.length ?? 1;

    /** Best-score bucket: the song, and for Strumline the practice speed and whether chords count. */
    const bestKey = () =>
      scoreKey(
        profile.id,
        songSel.value,
        c.strum ? `x${settings.get().speed}${settings.get().checkChords ? '+chords' : ''}` : '',
      );
    const refreshSong = () => {
      S('song-info').textContent = songSummary(songChart());
      S('best').textContent = describeBest(scores.best(bestKey()));
    };

    /** Re-reads everything that depends on the chosen mode. */
    const applyMode = () => {
      songSel.length = 0;
      const songs = songsFor(profile.id);
      for (const s of songs) songSel.add(new Option(s.chart.meta.title, s.id));
      const saved = settings.get().songs[`${c.keyPrefix}:${profile.id}`];
      songSel.value = songs.some((s) => s.id === saved) ? saved! : (songs[0]?.id ?? '');
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
    songSel.addEventListener('change', () => {
      settings.update({
        songs: { ...settings.get().songs, [`${c.keyPrefix}:${profile.id}`]: songSel.value },
      });
      refreshSong();
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
      if (disposed || beginInFlight || live?.demo) return;
      await startMic();
    };
    modeSel.addEventListener('change', () => void reopenMicIfNeeded());
    songSel.addEventListener('change', () => void reopenMicIfNeeded());
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

    const stopPlay = () => {
      cancelAnimationFrame(playRaf);
      backing?.stop();
      backing = null;
    };

    const runGame = (audio: GameAudio, chart: Chart, offset: number, startAt: number) => {
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
      });
      adapter.onMessage = (m) => game.handleMessage(m);
      backing = playBacking(
        ctx,
        clock,
        planBacking(chart, { metronome: opts.metronome, guideTone: false }),
      );
      const renderer = createRenderer(profile.renderer);
      const endAt = chartEnd(chart) + 0.9;
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
          overlay.textContent = String(Math.max(1, Math.ceil(-now / spb - 1e-6)));
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

    const showResults = (game: BeatlineGame, chart: Chart, audio: GameAudio) => {
      const s = game.session.score;
      const grade = letterGrade(s.accuracy);
      // the auto-play demo is a synthetic player: it never sets a high score
      const best = audio.demo
        ? null
        : scores.record(bestKey(), { score: s.score, accuracy: s.accuracy, grade });
      const bestLine = audio.demo
        ? 'Demo run: not saved as a score.'
        : best!.isNewBest
          ? 'New best!'
          : describeBest(best!.best);
      const timing = game.judge.judgments
        .filter((j) => j.timingError !== null && j.grade !== 'miss')
        .map((j) => j.timingError!);
      const avg = timing.length ? (timing.reduce((a, b) => a + b, 0) / timing.length) * 1000 : null;
      stages.results.innerHTML = `
      <section class="panel results">
        <div class="grade" data-id="grade">${grade}</div>
        <p class="status" data-id="best-line" role="status">${bestLine}</p>
        <dl>
          <dt>Score</dt><dd data-id="r-score">${s.score}</dd>
          <dt>Accuracy</dt><dd data-id="r-acc">${Math.round(s.accuracy * 100)}%</dd>
          <dt>Perfect</dt><dd data-id="r-perfect">${s.counts.perfect}</dd>
          <dt>Good</dt><dd data-id="r-good">${s.counts.good}</dd>
          <dt>Missed</dt><dd data-id="r-miss">${s.counts.miss}</dd>
          <dt>Extra hits</dt><dd data-id="r-strays">${game.strays}</dd>
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
          <button data-id="back">Back to setup</button>
          <button data-id="copy-log">Copy session log</button>
        </div>
        <p class="status" data-id="copy-status" role="status"></p>
      </section>`;
      show('results');
      const R = (id: string) =>
        stages.results.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
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
            ...(c.strum
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
    const songChart = (): Chart => {
      const songs = songsFor(profile.id);
      return (songs.find((s) => s.id === songSel.value) ?? songs[0]!).chart;
    };
    /** The chart as played: at the chosen practice speed. */
    const selectedChart = (): Chart =>
      rescaleChart(songChart(), c.strum ? settings.get().speed : 1);

    /** Starts a play-through with the live mic, or the auto-play demo. */
    const begin = async (demo: boolean) => {
      if (beginInFlight) return;
      beginInFlight = true;
      try {
        const chart = selectedChart();
        setupStatus.classList.remove('error');
        demoClaimed = demo;
        if (!demo) {
          if (classCount() > 1 && !model) {
            setupStatus.textContent = 'Teach it your sounds first (section 3).';
            setupStatus.classList.add('error');
            return;
          }
          const m = await startMic();
          if (!m) return;
          const ctx = m.ctx;
          live = { adapter: m, ctx, demo: false, model };
          runGame(live, chart, latencyOffset(ctx), ctx.currentTime + 0.6);
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
        const { performer, model: demoModel } = c.demo(profile);
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
        runGame(live, chart, 0, startAt);
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
      cancelAnimationFrame(playRaf);
      backing?.stop();
      void mic?.close();
      if (live?.demo) void live.adapter.close();
    };
  };
