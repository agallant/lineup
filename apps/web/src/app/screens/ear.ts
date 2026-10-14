import {
  EAR_KINDS,
  EAR_LABELS,
  EAR_LEVELS,
  EAR_RATING,
  earId,
  earRound,
  midiToFrequency,
  type EarKind,
  type EarLevel,
  type EarQuestion,
} from '@lineup/core';
import { escapeHtml } from '../audio';
import { jingleFor, playJingle } from '../game/jingle';
import { rewardHtml } from '../game/reward';
import { ProgressStore } from '../progress';
import type { Screen } from '../router';
import { ScoreStore, describeBest, scoreKey } from '../scores';
import { SettingsStore, safeLocalStorage } from '../settings';

const LEVEL_TEXT: Record<EarLevel, string> = {
  easy: 'Easy: a few clear choices',
  medium: 'Medium',
  hard: 'Hard: every choice',
};

/** How long a question's notes sound, and the gap between notes of an interval. */
const NOTE_S = 0.7;
const GAP_S = 0.15;
/** Pause after an answer before the next question. */
const NEXT_MS = 1100;

/** The oscillators of the question last played, so a new one can cut them off instead of overlapping. */
let sounding: OscillatorNode[] = [];

/** Plays a question's notes softly on the audio output, cutting off any still sounding or waiting. */
function playQuestion(ctx: AudioContext, q: EarQuestion): void {
  for (const old of sounding) {
    try {
      old.stop();
    } catch {
      // already stopped
    }
  }
  sounding = [];
  let t0 = ctx.currentTime + 0.05;
  // a key-setting arpeggio first, quick and quiet, then a pause before the note asked about
  q.lead?.forEach((midi, i) => {
    const start = t0 + i * 0.32;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFrequency(midi);
    osc.connect(gain).connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    osc.start(start);
    osc.stop(start + 0.42);
    sounding.push(osc);
  });
  if (q.lead) t0 += q.lead.length * 0.32 + 0.5;
  q.notes.forEach((midi, i) => {
    const start = q.together ? t0 : t0 + i * (NOTE_S + GAP_S);
    const length = q.together ? 1.6 : NOTE_S;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = midiToFrequency(midi);
    osc.connect(gain).connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(q.together ? 0.14 : 0.22, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.start(start);
    osc.stop(start + length + 0.02);
    sounding.push(osc);
  });
}

/** Ear training: hear an interval or a chord and name it. No instrument or microphone needed. */
export const earScreen: Screen = (root) => {
  const storage = safeLocalStorage();
  const settings = new SettingsStore(storage);
  const scores = new ScoreStore(storage);
  const progress = new ProgressStore(storage);
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Ear training</h1>
    <section class="panel" data-id="setup">
      <h2>Choose a round</h2>
      <div class="row">
        <label>Exercise <select data-id="kind">${EAR_KINDS.map(
          (k) => `<option value="${k}">${EAR_LABELS[k]}</option>`,
        ).join('')}</select></label>
        <label>Level <select data-id="level">${EAR_LEVELS.map(
          (l) => `<option value="${l}">${LEVEL_TEXT[l]}</option>`,
        ).join('')}</select></label>
      </div>
      <p class="muted">Ten questions. Use headphones or turn the volume up; listen as often as you like.</p>
      <p class="status" data-id="best" role="status"></p>
      <button class="primary" data-id="start">Start</button>
    </section>
    <section class="panel" data-id="quiz" hidden>
      <h2 data-id="count"></h2>
      <div class="row"><button data-id="replay">🔊 Play again</button></div>
      <div class="row" data-id="choices"></div>
      <p class="big" data-id="feedback" role="status"></p>
      <p class="muted" data-id="tally"></p>
    </section>
    <section class="panel results" data-id="results" hidden></section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const kindSel = $<HTMLSelectElement>('kind');
  const levelSel = $<HTMLSelectElement>('level');
  const show = (name: 'setup' | 'quiz' | 'results') => {
    for (const n of ['setup', 'quiz', 'results'] as const) $(n).hidden = n !== name;
  };
  const key = () => scoreKey('ear', earId(kindSel.value as EarKind, levelSel.value as EarLevel));
  const showBest = () => {
    $('best').textContent = describeBest(scores.best(key()));
  };
  showBest();
  kindSel.addEventListener('change', showBest);
  levelSel.addEventListener('change', showBest);

  const start = () => {
    ctx ??= new AudioContext();
    void ctx.resume();
    const kind = kindSel.value as EarKind;
    const level = levelSel.value as EarLevel;
    const round = earRound(kind, level, Math.floor(Math.random() * 100000));
    let index = 0;
    let correct = 0;
    let streak = 0;
    let bestStreak = 0;
    const began = Date.now();

    const finish = () => {
      const accuracy = correct / round.length;
      const score = correct * 100 + bestStreak * 20;
      const grade = accuracy >= 0.9 ? 'A' : accuracy >= 0.8 ? 'B' : accuracy >= 0.6 ? 'C' : 'D';
      const best = scores.record(key(), { score, accuracy, grade });
      const outcome = progress.recordPlay({
        profileId: 'ear',
        songId: earId(kind, level),
        accuracy,
        rating: EAR_RATING[level],
        chromatic: false,
        misses: round.length - correct,
        notes: round.length,
        seconds: (Date.now() - began) / 1000,
      });
      $('results').innerHTML = `
        <div class="grade" data-id="grade">${grade}</div>
        <p class="status" data-id="best-line" role="status">${
          best.isNewBest ? 'New best!' : describeBest(best.best)
        }</p>
        ${rewardHtml(accuracy, outcome)}
        <dl>
          <dt>Right</dt><dd data-id="r-right">${correct} of ${round.length}</dd>
          <dt>Score</dt><dd data-id="r-score">${score}</dd>
          <dt>Longest run</dt><dd>${bestStreak}</dd>
        </dl>
        <div class="row">
          <button class="primary" data-id="again">Another round</button>
          <button data-id="back">Back</button>
        </div>`;
      show('results');
      $('again').addEventListener('click', start);
      $('back').addEventListener('click', () => {
        showBest();
        show('setup');
      });
      if (settings.get().effects && ctx) {
        const kindOfJingle = jingleFor(outcome, best.isNewBest);
        if (kindOfJingle) playJingle(ctx, kindOfJingle);
      }
    };

    const ask = () => {
      const q = round[index]!;
      $('count').textContent = `Question ${index + 1} of ${round.length}`;
      $('feedback').textContent = '';
      $('tally').textContent =
        `${correct} right so far${streak > 1 ? ` · ${streak} in a row` : ''}`;
      const choices = $('choices');
      choices.replaceChildren();
      let answered = false;
      for (const name of q.choices) {
        const b = document.createElement('button');
        b.textContent = name;
        b.dataset['choice'] = name;
        b.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const right = name === q.answer;
          if (right) {
            correct++;
            streak++;
            bestStreak = Math.max(bestStreak, streak);
          } else {
            streak = 0;
          }
          $('feedback').innerHTML = right
            ? 'Right!'
            : `It was <strong>${escapeHtml(q.answer)}</strong>.`;
          for (const other of choices.querySelectorAll('button')) {
            other.disabled = true;
            if (other.dataset['choice'] === q.answer) other.classList.add('right');
            else if (other === b) other.classList.add('wrong');
          }
          // let them hear it again while the answer shows
          if (!right && ctx) playQuestion(ctx, q);
          timer = setTimeout(
            () => {
              index++;
              if (index < round.length) ask();
              else finish();
            },
            right ? NEXT_MS : NEXT_MS * 2,
          );
        });
        choices.appendChild(b);
      }
      if (ctx) playQuestion(ctx, q);
      $('replay').onclick = () => {
        if (ctx) playQuestion(ctx, q);
      };
    };
    show('quiz');
    ask();
  };
  $('start').addEventListener('click', start);

  return () => {
    clearTimeout(timer);
    if (ctx) void ctx.close();
  };
};
