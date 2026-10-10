import {
  CalibrationStore,
  SongClock,
  chartEnd,
  chartPitchRange,
  defaultOffsetFromLatencies,
  getProfile,
  letterGrade,
  songsFor,
  transposeChart,
  type Chart,
  type Difficulty,
  type PitchFrame,
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
import { planBacking, playBacking, midiToHz, type BackingHandle } from '../game/backing';
import { micAdvice, type MicStatus } from '../game/mic-advice';
import { formatSessionLog } from '../game/session-log';
import { SinglineGame, type DebugInfo } from '../game/singline-game';
import { SettingsStore, keyShiftFor, safeLocalStorage } from '../settings';
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
}

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
    <canvas class="meter" data-id="meter"></canvas>
    <dl>
      <dt>Note</dt><dd data-id="note">–</dd>
      <dt>Clarity</dt><dd><span class="bar"><span data-id="clarity-bar"></span></span> <span data-id="clarity">–</span></dd>
      <dt>Level</dt><dd data-id="level">–</dd>
    </dl>
    <p class="status" data-id="advice">${c.micPrompt}</p>
    <p class="status" data-id="bleed-result"></p>
  </section>

  <section class="panel">
    <h2>2. Song &amp; key</h2>
    <div class="row">
      <label>Song <select data-id="song"></select></label>
      <label>Key <select data-id="key"></select></label>
      <button data-id="hear">Hear first note</button>
    </div>
    <p data-id="range"></p>
  </section>

  <section class="panel">
    <h2>3. Options</h2>
    <label>Scoring
      <select data-id="difficulty">
        <option value="easy">Easy (wide pitch window)</option>
        <option value="normal">Normal</option>
        <option value="strict">Strict</option>
      </select>
    </label>
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
  <p class="status" data-id="setup-status"></p>
`;

const PLAY = `
  <div class="hud">
    <div><span class="label">Score</span> <strong data-id="score">0</strong></div>
    <div><span class="label">Combo</span> <strong data-id="combo">0</strong> <small data-id="mult"></small></div>
    <div><span class="label">Accuracy</span> <strong data-id="acc">–</strong></div>
    <button data-id="stop">Stop</button>
  </div>
  <div class="stage-wrap">
    <canvas class="stage" data-id="stage"></canvas>
    <div class="overlay" data-id="overlay"></div>
  </div>
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
    const songs = songsFor(c.profileId);
    const settings = new SettingsStore(safeLocalStorage());
    const calibration = new CalibrationStore(safeLocalStorage());

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
    for (const s of songs) songSel.add(new Option(s.chart.meta.title, s.id));
    songSel.value = songs.some((s) => s.id === current.songs[c.profileId])
      ? current.songs[c.profileId]!
      : songs[0]!.id;
    for (let k = -7; k <= 7; k++)
      keySel.add(
        new Option(
          k === 0 ? 'Original key' : `${k > 0 ? '+' : '−'}${Math.abs(k)} semitones`,
          String(k),
        ),
      );
    keySel.value = String(keyShiftFor(current, c.profileId));
    const difficultySel = S<HTMLSelectElement>('difficulty');
    difficultySel.value = current.difficulty;
    S<HTMLInputElement>('opt-guide').checked = current.guideTone;
    S<HTMLInputElement>('opt-metronome').checked = current.metronome;
    S<HTMLInputElement>('opt-debug').checked = current.debug;

    const selectedChart = (): Chart => {
      const song = songs.find((s) => s.id === songSel.value) ?? songs[0]!;
      return transposeChart(song.chart, Number(keySel.value));
    };

    const refreshRange = () => {
      const r = chartPitchRange(selectedChart());
      S('range').textContent = r ? c.rangeText(midiName(r.low), midiName(r.high)) : '';
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

    songSel.addEventListener('change', () => {
      settings.update({ songs: { ...settings.get().songs, [c.profileId]: songSel.value } });
      refreshRange();
    });
    keySel.addEventListener('change', () => {
      settings.update({
        keyShifts: { ...settings.get().keyShifts, [c.profileId]: Number(keySel.value) },
      });
      refreshRange();
    });
    difficultySel.addEventListener('change', () =>
      settings.update({ difficulty: difficultySel.value as Difficulty }),
    );
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
      adviceEl.textContent = c.adviceText?.[advice.status] ?? advice.message;
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
      const game = new SinglineGame({
        chart,
        profile,
        clock,
        latencyOffset: offset,
        hop: profile.detector.hopSize / ctx.sampleRate,
        difficulty: opts.difficulty,
      });
      adapter.onMessage = (m) => game.handleMessage(m);
      backing = playBacking(
        ctx,
        clock,
        planBacking(chart, { metronome: opts.metronome, guideTone: opts.guideTone }),
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
          const beats = Math.ceil(-now / spb - 1e-6);
          overlay.textContent = String(Math.max(1, beats));
          overlay.classList.add('on');
        } else {
          overlay.classList.remove('on');
        }

        if (opts.debug && ctx.currentTime - lastDebug > 0.1) {
          lastDebug = ctx.currentTime;
          debugEl.textContent = formatDebug(game.debug(ctx.currentTime), now, demo);
        }
        if (now > endAt) finish();
      };
      playRaf = requestAnimationFrame(tick);
    };

    const showResults = (game: SinglineGame, chart: Chart, audio: GameAudio) => {
      const s = game.session.score;
      const grade = letterGrade(s.accuracy);
      stages.results.innerHTML = `
      <section class="panel results">
        <div class="grade" data-id="grade">${grade}</div>
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
            difficulty: settings.get().difficulty,
            keyShift: Number(keySel.value),
            guideTone: settings.get().guideTone,
            metronome: settings.get().metronome,
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
        const chart = selectedChart();
        setupStatus.classList.remove('error');
        if (!demo) {
          const m = await startMic();
          if (!m) return;
          const ctx = m.ctx;
          const startAt = ctx.currentTime + 0.6;
          live = { adapter: m, ctx, demo: false };
          runGame(live, chart, latencyOffset(ctx), startAt);
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
