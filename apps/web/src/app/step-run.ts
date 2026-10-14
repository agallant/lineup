import { letterGrade, type Chart, type InstrumentProfile } from '@lineup/core';
import { toPitchFrame, type AnalyzerMessage } from '@lineup/input';
import type { MicSession } from '@lineup/input/mic';
import { fitCanvas, midiName, type Renderer } from '@lineup/render';
import { escapeHtml, playTone } from './audio';
import { midiToHz } from './game/backing';
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
    <canvas class="stage" data-id="stage" role="img" aria-label="The note to sing or play, on the line, with your pitch beside it"></canvas>
  </div>
  <p class="big" data-id="prompt" role="status"></p>
  <div class="row">
    <button data-id="hear">Hear it again</button>
    <button data-id="skip">Skip this note</button>
  </div>
`;

/** How long each asked note sounds, seconds. */
const TONE_S = 1;

export interface StepRunOptions {
  /** Where the page goes; its content is replaced. */
  container: HTMLElement;
  mic: MicSession;
  chart: Chart;
  /** The profile notes are judged by (its pitch tolerance and octave rule). */
  profile: InstrumentProfile;
  renderer: Renderer;
  /** Semitones added to the asked note when it is played to the player. */
  octave: number;
  /** "Sing or play", "Play": the start of the prompt. */
  verb: string;
  /** The screen's own handler for analyzer messages (its level meter), called first. */
  forward: (m: AnalyzerMessage) => void;
  /** All notes are done. */
  onFinish: (game: StepGame) => void;
  /** Stop was pressed. */
  onStop: () => void;
}

/**
 * Runs beginner step mode on an open microphone: each note is played aloud and shown, and the player
 * reproduces it (held for a moment) to move on, or skips or hears it again. Returns a function that
 * stops it (the screen's own cleanup).
 */
export function startStepRun(o: StepRunOptions): () => void {
  const { container, mic, chart, renderer } = o;
  const ctx = mic.ctx;
  container.innerHTML = STEP_PLAY;
  const P = <T extends HTMLElement = HTMLElement>(id: string): T =>
    container.querySelector<T>(`[data-id="${id}"]`)!;
  const stage = P<HTMLCanvasElement>('stage');
  const game = new StepGame(chart, o.profile);
  let raf = 0;
  let finished = false;
  let shownFor = -1;
  let passedAt = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const say = () => {
    const target = game.target;
    if (target === null) return;
    void ctx.resume();
    // the microphone must not hear the note from the speaker and pass it
    game.muteUntil(ctx.currentTime + TONE_S + 0.3);
    void playTone(ctx, midiToHz(target + o.octave), TONE_S, 0.22);
  };
  const stop = () => {
    finished = true;
    cancelAnimationFrame(raf);
    for (const t of timers) clearTimeout(t);
    timers.clear();
  };

  mic.onMessage = (msg) => {
    o.forward(msg);
    if (msg.type !== 'frame' || finished) return;
    if (game.feed(toPitchFrame(msg.frame))) passedAt = ctx.currentTime;
  };
  P('hear').addEventListener('click', () => {
    game.hearAgain();
    say();
  });
  P('skip').addEventListener('click', () => game.skip());
  P('stop').addEventListener('click', () => {
    stop();
    o.onStop();
  });

  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (game.done) {
      if (finished) return;
      stop();
      o.onFinish(game);
      return;
    }
    const { g, width, height } = fitCanvas(stage);
    renderer.draw(g, { width, height }, game.view());
    const pos = game.position;
    P('count').textContent = `Note ${pos.at} of ${pos.of}`;
    P('prompt').textContent =
      ctx.currentTime - passedAt < 0.8 && passedAt > 0
        ? 'Got it!'
        : `${o.verb} ${midiName(game.target!)} and hold it`;
    if (shownFor !== game.index) {
      shownFor = game.index;
      // a moment after a pass, so "Got it!" is seen before the next tone
      const at = game.index;
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

export interface StepResultsOptions {
  container: HTMLElement;
  game: StepGame;
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
        <dt>Notes passed</dt><dd data-id="r-passed">${game.passed} of ${game.notes.length}</dd>
        <dt>Skipped</dt><dd data-id="r-skipped">${game.skipped}</dd>
        <dt>Heard again</dt><dd data-id="r-hears">${game.hears}</dd>
      </dl>
      <div class="strip" data-id="strip">${game.statuses
        .map(
          (st, i) =>
            `<span class="cell ${st}" title="${escapeHtml(midiName(game.notes[i]?.pitch ?? 0))}"></span>`,
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
