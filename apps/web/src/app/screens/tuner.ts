import { micSupported, openMic, type MicSession } from '@lineup/input/mic';
import { midiToFrequency } from '@lineup/core';
import { playTone } from '../audio';
import { describeError } from '../mic-error';
import type { Screen } from '../router';
import { TUNINGS, readTuner } from '../tuner';

/** How long a reading stays on screen after the note stops. */
const HOLD_S = 0.6;
/** A needle at the end of the scale is 50 cents out. */
const FULL_SCALE_CENTS = 50;

/** A tuner: hear the string, see the note and how far off it is. A tool, not a game. */
export const tunerScreen: Screen = (root) => {
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Tuner</h1>
    <div class="row">
      <label>Tuning <select data-id="tuning">${TUNINGS.map(
        (t) => `<option value="${t.id}">${t.label}</option>`,
      ).join('')}</select></label>
      <label>String <select data-id="target"><option value="">Nearest (automatic)</option></select></label>
      <button data-id="start" class="primary">Start mic</button>
      <button data-id="stop" disabled>Stop</button>
    </div>
    <p class="status" data-id="status" role="status">Tap “Start mic”, then pluck one string at a time.</p>
    <section class="panel">
      <div class="note" data-id="note" aria-live="polite">–</div>
      <div class="cents"><div class="cents-needle" data-id="needle"></div></div>
      <p class="big" data-id="advice" role="status">Waiting for a note</p>
    </section>
    <section class="panel" data-id="refs-panel">
      <h2>Hear the note <small>(headphones, or the mic will hear it)</small></h2>
      <div class="row" data-id="refs"></div>
    </section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const tuningSel = $<HTMLSelectElement>('tuning');
  const startBtn = $<HTMLButtonElement>('start');
  const stopBtn = $<HTMLButtonElement>('stop');
  const needle = $('needle');

  let session: MicSession | null = null;
  let disposed = false;
  let raf = 0;
  let last: { hz: number; at: number } | null = null;

  const tuning = () => TUNINGS.find((t) => t.id === tuningSel.value) ?? TUNINGS[0]!;

  const targetSel = $<HTMLSelectElement>('target');
  const showRefs = () => {
    const refs = $('refs');
    refs.replaceChildren();
    // choose the string you are tuning when it is far from where it should be
    targetSel.replaceChildren(new Option('Nearest (automatic)', ''));
    for (const s of tuning().strings) targetSel.add(new Option(s.name, s.name));
    targetSel.parentElement!.hidden = tuning().strings.length === 0;
    $('refs-panel').hidden = tuning().strings.length === 0;
    for (const s of tuning().strings) {
      const b = document.createElement('button');
      b.textContent = s.name;
      b.setAttribute('aria-label', `Play the note ${s.name}`);
      b.addEventListener('click', () => {
        // use the open microphone's audio context if there is one, else make (and later close) our own
        const own = session ? null : new AudioContext();
        const ctx = session?.ctx ?? own!;
        void ctx.resume();
        void playTone(ctx, midiToFrequency(s.midi), 1.5).then(() => {
          if (own) void own.close();
        });
      });
      refs.appendChild(b);
    }
  };
  showRefs();
  tuningSel.addEventListener('change', showRefs);

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const s = session;
    if (!s) return;
    const fresh = last && s.ctx.currentTime - last.at < HOLD_S ? last : null;
    const reading = fresh ? readTuner(fresh.hz, tuning(), targetSel.value || undefined) : null;
    if (!reading) {
      $('note').textContent = '–';
      $('advice').textContent = 'Waiting for a note';
      needle.style.left = '50%';
      needle.classList.remove('in-tune');
      return;
    }
    $('note').textContent = reading.name;
    $('advice').textContent = reading.advice;
    const clamped = Math.max(-FULL_SCALE_CENTS, Math.min(FULL_SCALE_CENTS, reading.cents));
    needle.style.left = `${50 + (clamped / FULL_SCALE_CENTS) * 50}%`;
    needle.classList.toggle('in-tune', reading.state === 'in-tune');
  };
  raf = requestAnimationFrame(tick);

  const stop = async () => {
    const s = session;
    session = null;
    last = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    if (s) await s.close();
  };

  startBtn.addEventListener('click', () => {
    void (async () => {
      await stop();
      startBtn.disabled = true;
      $('status').textContent = 'Opening microphone…';
      try {
        const s = await openMic();
        if (disposed) {
          await s.close();
          return;
        }
        session = s;
        s.onMessage = (m) => {
          if (m.type === 'frame' && m.frame.pitchHz !== null && m.frame.clarity > 0.8) {
            last = { hz: m.frame.pitchHz, at: m.frame.time };
          }
        };
        stopBtn.disabled = false;
        $('status').textContent = 'Listening. Pluck a string.';
      } catch (err) {
        startBtn.disabled = false;
        $('status').textContent = describeError(err);
      }
    })();
  });
  stopBtn.addEventListener('click', () => {
    void stop();
    $('status').textContent = 'Stopped.';
  });
  if (!micSupported()) {
    startBtn.disabled = true;
    $('status').textContent =
      'This browser lacks getUserMedia or AudioWorklet. Use Safari 14.5+ or Chrome, over HTTPS.';
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    void stop();
  };
};
