import { chordMidis, letterGrade, type Chart, type InstrumentProfile } from '@lineup/core';
import { toPitchFrame, type AnalyzerMessage } from '@lineup/input';
import type { MicSession } from '@lineup/input/mic';
import { fitCanvas, midiName, type Renderer, type RenderView } from '@lineup/render';
import { escapeHtml, playTone } from './audio';
import { LANE_PITCH, midiToHz, playTonesNow } from './game/backing';
import { HitMonitor } from './game/beatline-game';
import { HitStepGame } from './game/hit-step-game';
import { jingleFor, playJingle } from './game/jingle';
import { playResultFor, rewardHtml } from './game/reward';
import { StepGame } from './game/step-game';
import { grantMilestones } from './milestones';
import type { ProgressStore } from './progress';
import { describeBest, type ScoreStore } from './scores';
import type { SettingsStore } from './settings';

/** The page of the beginner step mode: the note on the line, what to do, and the buttons. */
const STEP_PLAY = `
  <div class="hud">
    <div><strong data-id="count"></strong></div>
    <button data-id="stop">Stop</button>
  </div>
  <div class="stage-wrap">
    <canvas class="stage" data-id="stage" role="img" aria-label="The step to play, shown on the line"></canvas>
  </div>
  <p class="big" data-id="prompt" role="status"></p>
  <div class="row">
    <button data-id="hear">Hear it again</button>
    <button data-id="skip">Skip this one</button>
  </div>
`;

/** How long each asked note sounds, seconds. */
const TONE_S = 1;

/** What a step run needs from a game: the asked step, how to sound it, and how to take input. */
export interface StepEngine {
  readonly done: boolean;
  readonly index: number;
  readonly position: { at: number; of: number };
  /** What the player has to do now, in words. */
  readonly prompt: string;
  view(): RenderView;
  skip(): void;
  hearAgain(): void;
  muteUntil(ctxTime: number): void;
  /** Takes one analyzer message; true when it completed the step. */
  handle(message: AnalyzerMessage): boolean;
  /** Plays the asked step aloud; returns when it ends, on the audio clock. */
  sound(ctx: AudioContext): number;
}

/** Pitch games (voice, winds, bass): the asked note is played, and a held pitch passes it. */
export function pitchEngine(game: StepGame, octave: number, verb: string): StepEngine {
  return {
    get done() {
      return game.done;
    },
    get index() {
      return game.index;
    },
    get position() {
      return game.position;
    },
    get prompt() {
      return `${verb} ${midiName(game.target ?? 0)} and hold it`;
    },
    view: () => game.view(),
    skip: () => game.skip(),
    hearAgain: () => game.hearAgain(),
    muteUntil: (t) => game.muteUntil(t),
    handle: (m) => m.type === 'frame' && game.feed(toPitchFrame(m.frame)),
    sound(ctx) {
      const target = game.target;
      if (target === null) return ctx.currentTime;
      void playTone(ctx, midiToHz(target + octave), TONE_S, 0.22);
      return ctx.currentTime + TONE_S;
    },
  };
}

/** Hit games (strumming, drums, claps): the asked chord or drum is played, and played back to pass. */
export function hitEngine(
  game: HitStepGame,
  monitor: HitMonitor,
  profile: InstrumentProfile,
): StepEngine {
  return {
    get done() {
      return game.done;
    },
    get index() {
      return game.index;
    },
    get position() {
      return game.position;
    },
    get prompt() {
      return game.prompt;
    },
    view: () => game.view(),
    skip: () => game.skip(),
    hearAgain: () => game.hearAgain(),
    muteUntil: (t) => game.muteUntil(t),
    handle(m) {
      const hit = monitor.push(m);
      if (!hit) return false;
      return game.feed({
        time: hit.event.time,
        lane: hit.record.lane || undefined,
        chord: hit.event.chord,
      });
    },
    sound(ctx) {
      const s = game.step;
      if (!s) return ctx.currentTime;
      if (s.chord) {
        const midis = chordMidis(profile, s.chord) ?? [];
        // the strings in turn, quickly, as a strum, and the chord left ringing
        const tones = midis.map((midi) => ({ midi: midi + 12, duration: 0.9, level: 0.5 }));
        return playTonesNow(ctx, tones, 0.025);
      }
      const midi = LANE_PITCH[s.lane ?? 'hit'] ?? 66;
      const tones = Array.from({ length: s.count }, () => ({
        midi,
        duration: 0.12,
        level: 1.6,
        wave: 'triangle' as OscillatorType,
      }));
      return playTonesNow(ctx, tones, 0.4);
    },
  };
}

export interface StepRunOptions {
  /** Where the page goes; its content is replaced. */
  container: HTMLElement;
  mic: MicSession;
  engine: StepEngine;
  renderer: Renderer;
  /** The screen's own handler for analyzer messages (its level meter), called first. */
  forward: (m: AnalyzerMessage) => void;
  /** All steps are done. */
  onFinish: () => void;
  /** Stop was pressed. */
  onStop: () => void;
}

/**
 * Runs beginner step mode on an open microphone: each step is played aloud and shown, and the player
 * reproduces it to move on, or skips it or hears it again. Returns a function that stops it (the
 * screen's own cleanup).
 */
export function startStepRun(o: StepRunOptions): () => void {
  const { container, mic, engine, renderer } = o;
  const ctx = mic.ctx;
  container.innerHTML = STEP_PLAY;
  const P = <T extends HTMLElement = HTMLElement>(id: string): T =>
    container.querySelector<T>(`[data-id="${id}"]`)!;
  const stage = P<HTMLCanvasElement>('stage');
  let raf = 0;
  let finished = false;
  let shownFor = -1;
  let passedAt = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const say = () => {
    if (engine.done) return;
    void ctx.resume();
    // the microphone must not hear the sound from the speaker and pass it
    engine.muteUntil(engine.sound(ctx) + 0.3);
  };
  const stop = () => {
    finished = true;
    cancelAnimationFrame(raf);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  mic.onMessage = (msg) => {
    o.forward(msg);
    if (finished) return;
    if (engine.handle(msg)) passedAt = ctx.currentTime;
  };
  P('hear').addEventListener('click', () => {
    engine.hearAgain();
    say();
  });
  P('skip').addEventListener('click', () => engine.skip());
  P('stop').addEventListener('click', () => {
    stop();
    o.onStop();
  });

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (engine.done) {
      if (finished) return;
      stop();
      o.onFinish();
      return;
    }
    const { g, width, height } = fitCanvas(stage);
    renderer.draw(g, { width, height }, engine.view());
    const pos = engine.position;
    P('count').textContent = `Step ${pos.at} of ${pos.of}`;
    P('prompt').textContent =
      ctx.currentTime - passedAt < 0.8 && passedAt > 0 ? 'Got it!' : engine.prompt;
    if (shownFor !== engine.index) {
      shownFor = engine.index;
      // a moment after a pass, so "Got it!" is seen before the next sound
      const at = engine.index;
      const t = setTimeout(() => {
        timers.delete(t);
        if (!finished && shownFor === at) say();
      }, 600);
      timers.add(t);
    }
  };
  raf = requestAnimationFrame(tick);
  return stop;
}

/** What the results of a step run read from a finished game. */
export interface StepResultSource {
  passed: number;
  skipped: number;
  hears: number;
  accuracy: number;
  statuses: readonly string[];
  /** What each step is called (note names, chords, drum sounds). */
  labels: readonly string[];
  notes: { length: number };
}

export interface StepResultsOptions {
  container: HTMLElement;
  game: StepResultSource;
  chart: Chart;
  ctx: AudioContext;
  scores: ScoreStore;
  progress: ProgressStore;
  settings: SettingsStore;
  /** The score bucket for this song in step mode. */
  bestKey: string;
  profileId: string;
  songId: string;
  /** The practice speed, for games that have one. */
  speed?: number | undefined;
  /** What "Again", "Play it in time" and "Back to setup" do; "in time" must turn the option off. */
  onAgain: () => void;
  onTimed: () => void;
  onBack: () => void;
}

/**
 * Records a finished step run (its best score, and progress rated no higher than the easiest songs:
 * the notes are given away) and shows the results with the buttons to go on.
 */
export function showStepResults(o: StepResultsOptions): void {
  const { game, container } = o;
  const grade = letterGrade(game.accuracy);
  const best = o.scores.record(o.bestKey, {
    score: game.passed * 100,
    accuracy: game.accuracy,
    grade,
  });
  const played = playResultFor(
    o.profileId,
    o.songId,
    o.chart,
    { accuracy: game.accuracy, counts: { perfect: game.passed, good: 0, miss: game.skipped } },
    undefined,
    o.speed,
  );
  const outcome = o.progress.recordPlay({ ...played, rating: Math.min(played.rating, 2) });
  outcome.newAchievements.push(...grantMilestones(o.progress, o.scores.entries()));
  container.innerHTML = `
    <section class="panel results">
      <div class="grade" data-id="grade">${grade}</div>
      <p class="status" data-id="best-line" role="status">${best.isNewBest ? 'New best!' : describeBest(best.best)}</p>
      ${rewardHtml(game.accuracy, outcome)}
      <dl>
        <dt>Steps passed</dt><dd data-id="r-passed">${game.passed} of ${game.notes.length}</dd>
        <dt>Skipped</dt><dd data-id="r-skipped">${game.skipped}</dd>
        <dt>Heard again</dt><dd data-id="r-hears">${game.hears}</dd>
      </dl>
      <div class="strip" data-id="strip">${game.statuses
        .map(
          (st, i) => `<span class="cell ${st}" title="${escapeHtml(game.labels[i] ?? '')}"></span>`,
        )
        .join('')}</div>
      <p>Ready for more? Turn off “Beginner” to play it in time.</p>
      <div class="row">
        <button data-id="again" class="primary">Again</button>
        <button data-id="timed">Play it in time</button>
        <button data-id="back">Back to setup</button>
      </div>
    </section>`;
  if (o.settings.get().effects) {
    const kind = jingleFor(outcome, best.isNewBest);
    try {
      if (kind) playJingle(o.ctx, kind);
    } catch {
      // the audio context may already be closed: the jingle is a nicety
    }
  }
  const R = (id: string) => container.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!;
  R('again').addEventListener('click', o.onAgain);
  R('timed').addEventListener('click', o.onTimed);
  R('back').addEventListener('click', o.onBack);
}
