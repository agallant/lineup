import {
  SongClock,
  chartEnd,
  getProfile,
  letterGrade,
  midiToFrequency,
  rescaleChart,
  songsFor,
  type Chart,
} from '@lineup/core';
import { canPlayVoices, startVoice } from '../game/voices';
import { createRenderer, fitCanvas, midiName, pianoKeyAt, pianoLayout } from '@lineup/render';
import { buildInfoText } from '../build-info';
import { copyText } from '../clipboard';
import { planAllBacking, playBacking, type BackingHandle } from '../game/backing';
import { jingleFor, playJingle } from '../game/jingle';
import { mountBackingControls } from '../backing-controls';
import { KeyStepGame } from '../game/key-step-game';
import { KeylineGame } from '../game/keyline-game';
import { playResultFor, rewardHtml } from '../game/reward';
import { formatSessionLog } from '../game/session-log';
import { songSummary } from '../game/song-info';
import { grantMilestones } from '../milestones';
import {
  codeToMidi,
  midiSupported,
  openMidi,
  toAudioTime,
  type KeyMessage,
  type MidiSession,
} from '../midi-input';
import { ProgressStore } from '../progress';
import { closeAudio } from '../audio';
import type { Screen } from '../router';
import { ScoreStore, describeBest, scoreKey } from '../scores';
import { starsBySong } from '../scoreboard';
import { SettingsStore, nextSpeed, safeLocalStorage } from '../settings';
import {
  defaultSongId,
  loadPicker,
  mountPickerControls,
  rebuildPicker,
  savePicker,
} from '../song-picker';
import { TourStore, mountTour } from '../tour';
import { UserSongStore, userSongsFor } from '../user-songs';
import { hashParam } from '../courses';

const PROFILE_ID = 'keyboard';
/** Settings keys (in the `songs` map) this screen keeps. */
const SONG_KEY = 'keyline:keyboard';
const SOUND_KEY = 'keyline-sound';
/** Key timing, milliseconds as text: a press is judged this much earlier (+) or later (-). */
const TIMING_KEY = 'keyline-timing-ms';
const MAX_TIMING_MS = 150;
const MIDI_KEY = 'keyline-midi';

const TEMPLATE = `
  <p><a href="#/">← Back</a></p>
  <h1>Keyline <small>keyboard and piano</small></h1>
  <div data-id="stage-setup">
    <section class="panel">
      <h2 class="step">Song</h2>
      <div data-id="song-filters"></div>
      <div class="row">
        <label>Song <select data-id="song"></select></label>
        <label>Speed
          <select data-id="speed">
            <option value="0.5">50%</option>
            <option value="0.65">65%</option>
            <option value="0.8">80%</option>
            <option value="1">100%</option>
          </select>
        </label>
      </div>
      <p data-id="song-info"></p>
      <p data-id="best"></p>
    </section>
    <section class="panel">
      <h2 class="step">Your keyboard</h2>
      <p>Plug in a MIDI keyboard and connect it for exact timing, or play on the on-screen keys (touch or click) or the computer keyboard (A S D F G H J K for white keys, W E T Y U O P for black; Z and X change octave).</p>
      <div class="row">
        <button data-id="midi-connect">Connect a MIDI keyboard</button>
      </div>
      <p class="status" data-id="midi-status" role="status"></p>
    </section>
    <section class="panel">
      <h2 class="step">Options</h2>
      <label class="check"><input type="checkbox" data-id="opt-sound" /> Make a piano sound when I press a key (turn off if your keyboard makes its own)</label>
      <div data-id="backing-box"></div>
      <label class="check"><input type="checkbox" data-id="opt-step" /> Beginner: one step at a time, no timing (it plays the notes, you press them)</label>
      <label class="check"><input type="checkbox" data-id="opt-metronome" /> Metronome clicks</label>
      <label>Key timing
        <input type="range" data-id="opt-timing" min="-150" max="150" step="5" value="0" />
        <output data-id="timing-out">0 ms</output>
      </label>
      <p>Keys and MIDI have almost no delay of their own, so this starts at 0. If your presses count too early, move it below 0; too late, above 0. Bluetooth speakers may need a little.</p>
    </section>
    <div class="row">
      <button data-id="play" class="primary">Play</button>
      <button data-id="demo">Watch auto-play demo</button>
    </div>
    <p class="status" data-id="setup-status" role="status"></p>
  </div>
  <div data-id="stage-play" hidden></div>
  <div data-id="stage-results" hidden></div>
`;

const STEP_PLAY = `
  <div class="hud">
    <div><strong data-id="count"></strong></div>
    <button data-id="stop">Stop</button>
  </div>
  <div class="stage-wrap">
    <canvas class="stage" data-id="stage" role="img" aria-label="The keys to press, on a piano keyboard"></canvas>
  </div>
  <p class="big" data-id="prompt" role="status"></p>
  <div class="row">
    <button data-id="hear">Hear it again</button>
    <button data-id="skip">Skip this one</button>
  </div>
  <p class="muted" data-id="keys-hint"></p>
`;

const PLAY = `
  <div class="hud">
    <div><span class="label">Score</span> <strong data-id="score">0</strong></div>
    <div><span class="label">Combo</span> <strong data-id="combo">0</strong> <small data-id="mult"></small></div>
    <div><span class="label">Accuracy</span> <strong data-id="acc">–</strong></div>
    <button data-id="stop">Stop</button>
  </div>
  <div class="stage-wrap">
    <canvas class="stage" data-id="stage" role="img" aria-label="The song: notes falling onto a piano keyboard. Press the keys as the notes reach them."></canvas>
    <div class="overlay" data-id="overlay" aria-live="assertive"></div>
  </div>
  <p class="muted" data-id="keys-hint"></p>
`;

/** Turns a key press into a piano note; returns a function that lets it fade out. */
function sound(ctx: AudioContext, midi: number, velocity: number): () => void {
  if (canPlayVoices(ctx)) {
    const note = startVoice(ctx, 'piano', midi, ctx.currentTime, 0.5 + 1.1 * velocity);
    return () => note.release(ctx.currentTime);
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = midiToFrequency(midi);
  osc.connect(gain).connect(ctx.destination);
  const t = ctx.currentTime;
  const peak = 0.08 + 0.2 * velocity;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(peak, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.5);
  osc.start(t);
  return () => {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.stop(now + 0.3);
  };
}

/** Keyline: play the keys as the notes fall onto them, on a MIDI keyboard or the screen. */
export const keylineScreen: Screen = (root) => {
  root.innerHTML = TEMPLATE;
  mountTour(root, 'keyline', new TourStore(safeLocalStorage()));
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

  const store = safeLocalStorage();
  const settings = new SettingsStore(store);
  const scores = new ScoreStore(store);
  const progress = new ProgressStore(store);
  const mine = new UserSongStore(store);
  const profile = getProfile(PROFILE_ID);

  // opened from a learning path step: choose its song and play it whole
  const wanted = hashParam(location.hash, 'song');
  if (wanted) {
    settings.update({
      speed: 1,
      stepMode: false,
      songs: { ...settings.get().songs, [SONG_KEY]: wanted },
    });
  }

  let midi: MidiSession | null = null;
  let disposed = false;
  let beginInFlight = false;
  let playRaf = 0;
  let backing: BackingHandle | null = null;
  /** The running game, if any: MIDI keys reach it through here. */
  let keyHandler: ((m: KeyMessage) => void) | null = null;
  let sessionStart = new Date();
  /** Stops whatever is running when the screen goes away (set while a game runs). */
  let cleanup: (() => void) | null = null;

  const songSel = $<HTMLSelectElement>('song');
  const speedSel = $<HTMLSelectElement>('speed');
  const soundBox = $<HTMLInputElement>('opt-sound');
  const metroBox = $<HTMLInputElement>('opt-metronome');
  const midiBtn = $<HTMLButtonElement>('midi-connect');
  const midiStatus = $('midi-status');
  const setupStatus = $('setup-status');
  speedSel.value = String(settings.get().speed);
  metroBox.checked = settings.get().metronome;
  soundBox.checked = settings.get().songs[SOUND_KEY] !== 'off';
  const timingBox = $<HTMLInputElement>('opt-timing');
  const timingOut = $('timing-out');
  const savedTiming = Number(settings.get().songs[TIMING_KEY]);
  timingBox.value = String(
    Number.isFinite(savedTiming)
      ? Math.max(-MAX_TIMING_MS, Math.min(MAX_TIMING_MS, savedTiming))
      : 0,
  );
  const showTiming = () => {
    timingOut.textContent = `${Number(timingBox.value) > 0 ? '+' : ''}${timingBox.value} ms`;
  };
  showTiming();

  const songs = () => [...songsFor(PROFILE_ID), ...userSongsFor(PROFILE_ID, mine)];
  const entry = () => {
    const all = songs();
    return all.find((s) => s.id === songSel.value) ?? all[0]!;
  };
  mountBackingControls($('backing-box'), settings, { music: false });
  const stepBox = $<HTMLInputElement>('opt-step');
  stepBox.checked = settings.get().stepMode;
  stepBox.addEventListener('change', () => {
    settings.update({ stepMode: stepBox.checked });
    refreshSong();
  });
  const speed = () => settings.get().speed;
  const bestKey = () =>
    scoreKey(PROFILE_ID, entry().id, `x${speed()}${settings.get().stepMode ? '|step' : ''}`);
  const chartToPlay = (): Chart => rescaleChart(entry().chart, speed());

  const stars = starsBySong(scores.entries(), PROFILE_ID);
  const picker = loadPicker(store);
  /** Refills the menu from the filters, keeping the chosen song when it is still shown. */
  const rebuild = (wanted: string | null) => {
    const all = songs();
    const changed = rebuildPicker(
      songSel,
      { songs: all, stars: (id) => stars.get(id) ?? null, random: [], state: picker },
      wanted,
      defaultSongId(PROFILE_ID, all),
    );
    if (changed) songSel.dispatchEvent(new Event('change'));
  };
  mountPickerControls($('song-filters'), picker, {
    hasRandom: false,
    onChange: () => {
      savePicker(store, picker);
      rebuild(songSel.value);
    },
  });
  // the song last played, else (for a new player) the first step of the learning path
  rebuild(settings.get().songs[SONG_KEY] ?? null);
  const refreshSong = () => {
    $('song-info').textContent = songSummary(entry().chart);
    $('best').textContent = describeBest(scores.best(bestKey()));
  };
  refreshSong();
  songSel.addEventListener('change', () => {
    settings.update({ songs: { ...settings.get().songs, [SONG_KEY]: songSel.value } });
    refreshSong();
  });
  speedSel.addEventListener('change', () => {
    settings.update({ speed: Number(speedSel.value) });
    refreshSong();
  });
  metroBox.addEventListener('change', () => settings.update({ metronome: metroBox.checked }));
  timingBox.addEventListener('input', () => {
    showTiming();
    settings.update({ songs: { ...settings.get().songs, [TIMING_KEY]: timingBox.value } });
  });
  soundBox.addEventListener('change', () =>
    settings.update({
      songs: { ...settings.get().songs, [SOUND_KEY]: soundBox.checked ? 'on' : 'off' },
    }),
  );

  // ------------------------------------------------------------------ MIDI

  const describeMidi = () => {
    const names = midi?.devices() ?? [];
    midiStatus.textContent = !midiSupported()
      ? 'This browser cannot use MIDI keyboards (Safari on iPad cannot). The on-screen keys and the computer keyboard work everywhere.'
      : names.length
        ? `Connected: ${names.join(', ')}. Play any key to try it.`
        : midi
          ? 'Allowed, but no keyboard found. Plug one in: it is picked up automatically.'
          : 'Not connected.';
  };
  const connectMidi = async () => {
    midiBtn.disabled = true;
    try {
      const s = await openMidi((m) => keyHandler?.(m), describeMidi);
      if (disposed) {
        s.close();
        return;
      }
      midi = s;
      settings.update({ songs: { ...settings.get().songs, [MIDI_KEY]: 'on' } });
      midiBtn.textContent = 'MIDI keyboard connected';
    } catch (err) {
      midiBtn.disabled = false;
      midiStatus.textContent = `Could not open MIDI: ${err instanceof Error ? err.message : String(err)}`;
      return;
    }
    describeMidi();
  };
  midiBtn.addEventListener('click', () => void connectMidi());
  if (!midiSupported()) midiBtn.disabled = true;
  describeMidi();
  // permission was given before: reconnect without asking again
  if (midiSupported() && settings.get().songs[MIDI_KEY] === 'on') void connectMidi();

  // ------------------------------------------------------------------ play

  const stopPlay = () => {
    cancelAnimationFrame(playRaf);
    backing?.stop();
    backing = null;
    keyHandler = null;
  };

  const run = (demo: boolean) => {
    if (beginInFlight) return;
    beginInFlight = true;
    try {
      const chart = chartToPlay();
      const ctx = new AudioContext();
      void ctx.resume();
      sessionStart = new Date();
      const step = !demo && settings.get().stepMode;
      stages.play.innerHTML = step ? STEP_PLAY : PLAY;
      show('play');
      const P = <T extends HTMLElement = HTMLElement>(id: string): T =>
        stages.play.querySelector<T>(`[data-id="${id}"]`)!;
      const stage = P<HTMLCanvasElement>('stage');
      const overlay = step ? null : P('overlay');
      const spb = 60 / chart.meta.bpm;
      const countIn = chart.meta.countInBeats * spb;
      const offset = demo ? 0 : Number(timingBox.value) / 1000;
      const clock = new SongClock(ctx);
      clock.start(-countIn, ctx.currentTime + 0.6);
      const game = new KeylineGame({ chart, profile, clock, latencyOffset: offset });
      const stepGame = step ? new KeyStepGame(chart, profile) : null;
      const opts = settings.get();
      // the step mode always sounds the notes it asks; the player's own presses sound as the option says
      const withSound = soundBox.checked || demo;
      let passedAt = 0;
      backing = step
        ? null
        : playBacking(
            ctx,
            clock,
            planAllBacking(chart, {
              metronome: opts.metronome,
              guideTone: false,
              accompaniment: 'off',
              drums: opts.drums,
            }),
          );
      const renderer = createRenderer(profile.renderer);

      // keys sounding now, so a release can fade the tone
      const voices = new Map<number, () => void>();
      const down = (midiNote: number, ctxTime: number, velocity: number) => {
        if (voices.has(midiNote)) return;
        if (stepGame) {
          if (stepGame.press(midiNote)) passedAt = ctx.currentTime;
        } else game.press(midiNote, ctxTime, velocity);
        if (withSound) voices.set(midiNote, sound(ctx, midiNote, velocity));
        else voices.set(midiNote, () => undefined);
      };
      const up = (midiNote: number) => {
        game.release(midiNote);
        stepGame?.release(midiNote);
        voices.get(midiNote)?.();
        voices.delete(midiNote);
      };
      const upAll = () => {
        for (const n of [...voices.keys()]) up(n);
        game.releaseAll();
        stepGame?.releaseAll();
      };
      const nowCtx = (e: { timeStamp: number }) =>
        toAudioTime(e.timeStamp, performance.now(), ctx.currentTime);

      const pitched = chart.notes.flatMap((n) => (n.pitch === undefined ? [] : [n.pitch]));
      let base = Math.floor(Math.min(...pitched, 60) / 12) * 12;
      const hint = P('keys-hint');
      const showHint = () => {
        hint.textContent = demo
          ? ''
          : `Computer keys: A S D F G H J K play from C${base / 12 - 1}; Z and X move an octave.`;
      };
      showHint();

      if (!demo) {
        keyHandler = (m) => {
          if (m.type === 'on') down(m.midi, nowCtx(m), m.velocity);
          else up(m.midi);
        };
      }

      // the on-screen keys
      const touches = new Map<number, number>();
      const keyAt = (e: PointerEvent): number | null => {
        const r = stage.getBoundingClientRect();
        const size = { width: r.width, height: r.height };
        const { keys, keyboardHeight } = pianoLayout(chart.notes, size);
        return pianoKeyAt(keys, keyboardHeight, size, e.clientX - r.left, e.clientY - r.top);
      };
      const onDown = (e: PointerEvent) => {
        if (demo) return;
        const k = keyAt(e);
        if (k === null) return;
        e.preventDefault();
        stage.setPointerCapture?.(e.pointerId);
        touches.set(e.pointerId, k);
        down(k, nowCtx(e), 0.8);
      };
      const onMove = (e: PointerEvent) => {
        const was = touches.get(e.pointerId);
        if (was === undefined) return;
        const k = keyAt(e);
        if (k === was || k === null) return;
        // sliding onto another key plays it, as a glissando
        up(was);
        touches.set(e.pointerId, k);
        down(k, nowCtx(e), 0.7);
      };
      const onUp = (e: PointerEvent) => {
        const k = touches.get(e.pointerId);
        if (k === undefined) return;
        touches.delete(e.pointerId);
        up(k);
      };
      stage.addEventListener('pointerdown', onDown);
      stage.addEventListener('pointermove', onMove);
      stage.addEventListener('pointerup', onUp);
      stage.addEventListener('pointercancel', onUp);

      // the computer keyboard
      const held = new Map<string, number>();
      const onKeyDown = (e: KeyboardEvent) => {
        if (demo || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.code === 'KeyZ' || e.code === 'KeyX') {
          base = Math.max(12, Math.min(96, base + (e.code === 'KeyZ' ? -12 : 12)));
          showHint();
          return;
        }
        const n = codeToMidi(e.code, base);
        if (n === null || held.has(e.code)) return;
        held.set(e.code, n);
        down(n, nowCtx(e), 0.8);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        const n = held.get(e.code);
        if (n === undefined) return;
        held.delete(e.code);
        up(n);
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', upAll);

      // the demo: a player who presses every note about when it is due
      const queue = demo
        ? chart.notes
            .map((n, i) => ({
              at: n.t + ((i * 37) % 21) / 1000 - 0.01,
              end: n.t + Math.max(0.1, n.duration * 0.9),
              midi: n.pitch ?? 60,
            }))
            .sort((a, b) => a.at - b.at)
        : [];
      const releases: { at: number; midi: number }[] = [];

      const endAt = chartEnd(chart) + 0.9;
      let finished = false;
      const teardown = () => {
        cancelAnimationFrame(playRaf);
        for (const t of stepTimers) clearTimeout(t);
        stepTimers.clear();
        stage.removeEventListener('pointerdown', onDown);
        stage.removeEventListener('pointermove', onMove);
        stage.removeEventListener('pointerup', onUp);
        stage.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', upAll);
        upAll();
        stopPlay();
      };
      cleanup = () => {
        finished = true;
        teardown();
        closeAudio(ctx);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        teardown();
        game.finish();
        showResults(game, chart, ctx, demo);
      };
      P('stop').addEventListener('click', () => {
        finished = true;
        teardown();
        closeAudio(ctx);
        show('setup');
      });

      // beginner mode: the asked keys are played, then waited for
      let shownFor = -1;
      const stepTimers = new Set<ReturnType<typeof setTimeout>>();
      const say = () => {
        if (!stepGame) return;
        void ctx.resume();
        for (const m of stepGame.target) {
          const stop = sound(ctx, m, 0.7);
          setTimeout(stop, 900);
        }
      };
      if (stepGame) {
        P('hear').addEventListener('click', () => {
          stepGame.hearAgain();
          say();
        });
        P('skip').addEventListener('click', () => stepGame.skip());
      }
      const stepTick = (sg: KeyStepGame) => {
        if (sg.done) {
          if (finished) return;
          finished = true;
          teardown();
          showStepResults(sg, chart, ctx);
          return;
        }
        const { g, width, height } = fitCanvas(stage);
        renderer.draw(g, { width, height }, sg.view());
        P('count').textContent = `Step ${sg.index + 1} of ${sg.steps.length}`;
        P('prompt').textContent =
          ctx.currentTime - passedAt < 0.8 && passedAt > 0
            ? 'Got it!'
            : `Press ${sg.remaining.map((m) => midiName(m)).join(' + ')}`;
        if (shownFor !== sg.index) {
          shownFor = sg.index;
          // the step this was scheduled for: a quick player may have moved on by the time it fires
          const at = sg.index;
          const t = setTimeout(() => {
            stepTimers.delete(t);
            if (!finished && shownFor === at) say();
          }, 500);
          stepTimers.add(t);
        }
      };

      const tick = () => {
        playRaf = requestAnimationFrame(tick);
        if (stepGame) return stepTick(stepGame);
        const now = clock.now();
        while (queue.length && queue[0]!.at <= now) {
          const p = queue.shift()!;
          down(p.midi, clock.toSourceTime(p.at), 0.8);
          releases.push({ at: p.end, midi: p.midi });
        }
        for (let i = releases.length - 1; i >= 0; i--) {
          if (releases[i]!.at <= now) up(releases.splice(i, 1)[0]!.midi);
        }
        game.update();
        const { g, width, height } = fitCanvas(stage);
        renderer.draw(g, { width, height }, game.view());
        const s = game.session.score;
        P('score').textContent = String(s.score);
        P('combo').textContent = String(s.combo);
        P('mult').textContent = s.multiplier > 1 ? `×${s.multiplier.toFixed(1)}` : '';
        P('acc').textContent = s.judged ? `${Math.round(s.accuracy * 100)}%` : '–';
        if (now < 0) {
          overlay!.textContent = String(Math.max(1, Math.ceil(-now / spb - 1e-6)));
          overlay!.classList.add('on');
        } else overlay!.classList.remove('on');
        if (now > endAt) finish();
      };
      playRaf = requestAnimationFrame(tick);
    } catch (err) {
      setupStatus.textContent = err instanceof Error ? err.message : String(err);
      setupStatus.classList.add('error');
      show('setup');
    } finally {
      beginInFlight = false;
    }
  };

  const showStepResults = (game: KeyStepGame, chart: Chart, ctx: AudioContext) => {
    const grade = letterGrade(game.accuracy);
    const best = scores.record(bestKey(), {
      score: game.passed * 100,
      accuracy: game.accuracy,
      grade,
    });
    refreshSong();
    // beginner steps count toward progress, but are rated no higher than the easiest pieces
    const played = playResultFor(
      PROFILE_ID,
      entry().id,
      chart,
      { accuracy: game.accuracy, counts: { perfect: game.passed, good: 0, miss: game.skipped } },
      undefined,
      speed(),
    );
    const outcome = progress.recordPlay({ ...played, rating: Math.min(played.rating, 2) });
    outcome.newAchievements.push(...grantMilestones(progress, scores.entries()));
    stages.results.innerHTML = `
      <section class="panel results">
        <div class="grade" data-id="grade">${grade}</div>
        <p class="status" data-id="best-line" role="status">${best.isNewBest ? 'New best!' : describeBest(best.best)}</p>
        ${rewardHtml(game.accuracy, outcome)}
        <dl>
          <dt>Steps passed</dt><dd data-id="r-passed">${game.passed} of ${game.steps.length}</dd>
          <dt>Skipped</dt><dd data-id="r-skipped">${game.skipped}</dd>
          <dt>Wrong keys</dt><dd data-id="r-wrong">${game.wrong}</dd>
          <dt>Heard again</dt><dd data-id="r-hears">${game.hears}</dd>
        </dl>
        <p>Ready for more? Turn off “Beginner” to play it in time.</p>
        <div class="row">
          <button data-id="again" class="primary">Again</button>
          <button data-id="timed">Play it in time</button>
          <button data-id="back">Back to setup</button>
        </div>
      </section>`;
    show('results');
    if (settings.get().effects) {
      const kind = jingleFor(outcome, best.isNewBest);
      try {
        if (kind) playJingle(ctx, kind);
        else closeAudio(ctx);
      } catch {
        // the jingle is a nicety
      }
    } else closeAudio(ctx);
    const R = (id: string) => stages.results.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
    R('again').addEventListener('click', () => run(false));
    R('timed').addEventListener('click', () => {
      settings.update({ stepMode: false });
      stepBox.checked = false;
      refreshSong();
      run(false);
    });
    R('back').addEventListener('click', () => show('setup'));
  };

  const showResults = (game: KeylineGame, chart: Chart, ctx: AudioContext, demo: boolean) => {
    const s = game.session.score;
    const grade = letterGrade(s.accuracy);
    const best = demo
      ? null
      : scores.record(bestKey(), { score: s.score, accuracy: s.accuracy, grade });
    refreshSong();
    const outcome = demo
      ? null
      : progress.recordPlay(playResultFor(PROFILE_ID, entry().id, chart, s, undefined, speed()));
    if (outcome) outcome.newAchievements.push(...grantMilestones(progress, scores.entries()));
    const bestLine = demo
      ? 'Demo run: not saved as a score.'
      : best!.isNewBest
        ? 'New best!'
        : describeBest(best!.best);
    const timing = game.judge.judgments
      .filter((j) => j.timingError !== null && j.grade !== 'miss')
      .map((j) => j.timingError!);
    const avg = timing.length ? (timing.reduce((a, b) => a + b, 0) / timing.length) * 1000 : null;
    const faster = !demo && s.accuracy >= 0.9 ? nextSpeed(speed()) : null;
    const wrong = game.judge.judgments.filter((j) => j.reason === 'wrong-pitch').length;
    stages.results.innerHTML = `
      <section class="panel results">
        <div class="grade" data-id="grade">${grade}</div>
        <p class="status" data-id="best-line" role="status">${bestLine}</p>
        ${outcome ? rewardHtml(s.accuracy, outcome) : ''}
        <dl>
          <dt>Score</dt><dd data-id="r-score">${s.score}</dd>
          <dt>Accuracy</dt><dd data-id="r-acc">${Math.round(s.accuracy * 100)}%</dd>
          <dt>Perfect</dt><dd data-id="r-perfect">${s.counts.perfect}</dd>
          <dt>Good</dt><dd data-id="r-good">${s.counts.good}</dd>
          <dt>Missed</dt><dd data-id="r-miss">${s.counts.miss}</dd>
          <dt>Wrong key</dt><dd data-id="r-wrong">${wrong}</dd>
          <dt>Extra presses</dt><dd data-id="r-strays">${game.strays}</dd>
          <dt>Timing</dt><dd data-id="r-timing">${avg === null ? '–' : `${avg > 0 ? '+' : ''}${avg.toFixed(0)} ms on average (${avg > 15 ? 'late' : avg < -15 ? 'early' : 'on the beat'})`}</dd>
          <dt>Best combo</dt><dd data-id="r-combo">${s.maxCombo}</dd>
        </dl>
        <div class="strip" data-id="strip">${game.session.statuses
          .map((st) => `<span class="cell ${st}"></span>`)
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
    if (!demo && settings.get().effects) {
      const kind = jingleFor(outcome, best?.isNewBest ?? false);
      try {
        if (kind) playJingle(ctx, kind);
        else closeAudio(ctx);
      } catch {
        // the jingle is a nicety
      }
    } else closeAudio(ctx);
    const R = (id: string) => stages.results.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
    R('again').addEventListener('click', () => run(demo));
    R('back').addEventListener('click', () => show('setup'));
    stages.results.querySelector('[data-id=faster]')?.addEventListener('click', () => {
      if (faster === null) return;
      settings.update({ speed: faster });
      speedSel.value = String(faster);
      run(false);
    });
    R('copy-log').addEventListener('click', () => {
      const text = formatSessionLog({
        build: buildInfoText(),
        mode: 'Keyline',
        at: sessionStart,
        userAgent: navigator.userAgent,
        profileId: PROFILE_ID,
        songTitle: chart.meta.title,
        demo,
        options: {
          speed: speed(),
          midi: (midi?.devices().length ?? 0) > 0,
          sound: soundBox.checked,
          metronome: settings.get().metronome,
        },
        audio: null,
        latencyOffsetMs: game.latencyOffsetMs,
        score: s,
        grade,
        judgments: game.judge.judgments,
        strays: game.strays,
      });
      void copyText(text).then((ok) => {
        const status = stages.results.querySelector('[data-id="copy-status"]');
        if (status)
          status.textContent = ok
            ? 'Copied. Paste it into the chat.'
            : 'Could not copy on this browser.';
      });
    });
  };

  $<HTMLButtonElement>('play').addEventListener('click', () => run(false));
  $<HTMLButtonElement>('demo').addEventListener('click', () => run(true));

  return () => {
    disposed = true;
    cleanup?.();
    stopPlay();
    midi?.close();
  };
};
