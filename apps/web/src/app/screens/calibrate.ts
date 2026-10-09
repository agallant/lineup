import {
  CalibrationStore,
  defaultOffsetFromLatencies,
  recordFromEstimate,
  type CalibrationRecord,
} from '@lineup/core';
import { micSupported, openMic, type MicSession } from '@lineup/input/mic';
import { scheduleClicks } from '../audio';
import { analyzeCalibration, planCalibration, type CalibrationPlan } from '../game/calibration-run';
import { safeLocalStorage } from '../settings';
import type { Screen } from '../router';

const TEMPLATE = `
  <p><a href="#/">← Back</a></p>
  <h1>Calibration</h1>
  <p>Lineup needs to know how late your sound reaches it: speaker delay, mic delay and your own
  habit of landing a bit early or late. You'll clap along to a click track.</p>
  <div class="banner warn">Wear <strong>headphones</strong> for the clicks, or the mic will hear them.</div>
  <ol>
    <li>Tap <strong>Start</strong> and allow the microphone.</li>
    <li>For the first 3 clicks, stay <strong>quiet</strong> (this checks the mic can't hear the clicks).</li>
    <li>Then <strong>clap</strong>, tap the table, or say “ta” <strong>exactly on every click</strong>.</li>
  </ol>
  <div class="panel">
    <h2>Saved</h2>
    <p data-id="saved">Not calibrated yet.</p>
  </div>
  <div class="row">
    <button data-id="start">Start</button>
    <button data-id="reset" hidden>Forget saved calibration</button>
  </div>
  <div class="beat" data-id="beat" aria-hidden="true"></div>
  <p class="status" data-id="status"></p>
  <div class="panel" data-id="result" hidden></div>
`;

export const calibrateScreen: Screen = (root) => {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`[data-id="${id}"]`);
    if (!el) throw new Error(`missing [data-id=${id}]`);
    return el;
  };
  const startBtn = $<HTMLButtonElement>('start');
  const resetBtn = $<HTMLButtonElement>('reset');
  const status = $('status');
  const beat = $('beat');
  const result = $('result');
  const saved = $('saved');
  const store = new CalibrationStore(safeLocalStorage());

  let mic: MicSession | null = null;
  let raf = 0;
  let stopClicks: (() => void) | null = null;
  let disposed = false;
  let deviceKey = 'default';

  const setStatus = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };

  const showSaved = (record: CalibrationRecord | null) => {
    saved.textContent = record
      ? `${record.offsetMs.toFixed(0)} ms (±${record.spreadMs.toFixed(0)} ms, ${record.quality}), measured ${record.measuredAt.slice(0, 10)}`
      : 'Not calibrated yet.';
    resetBtn.hidden = !record;
  };
  showSaved(store.load(deviceKey));

  const finish = (plan: CalibrationPlan, onsets: number[], prior: number) => {
    cancelAnimationFrame(raf);
    beat.className = 'beat';
    stopClicks?.();
    result.hidden = false;
    const outcome = analyzeCalibration(plan, onsets, prior);
    if (outcome.kind === 'bleed') {
      result.innerHTML = `<h2>Mic hears the clicks</h2><p>The microphone picked up the click track while you were quiet.
        Put on headphones (or turn the volume down) and try again.</p>`;
      setStatus('Calibration not saved.', true);
    } else if (outcome.kind === 'failed') {
      result.innerHTML = `<h2>Couldn't measure</h2><p>${outcome.reason}</p>`;
      setStatus('Calibration not saved.', true);
    } else {
      const e = outcome.estimate;
      const record = recordFromEstimate(e);
      const savedOk = store.save(record, deviceKey);
      result.innerHTML = `<h2>${(e.offset * 1000).toFixed(0)} ms</h2>
        <p>Spread ±${(e.spread * 1000).toFixed(0)} ms over ${e.used} claps. Quality: <span class="badge ${
          e.quality === 'good' ? 'ok' : e.quality === 'ok' ? 'warn' : 'bad'
        }">${e.quality}</span></p>
        <p>${savedOk ? 'Saved on this device.' : 'Could not save (browser storage is blocked); it applies until you leave this page.'}</p>
        ${e.quality === 'poor' ? '<p>Your timing was uneven. Try again, tapping steadily with the clicks.</p>' : ''}`;
      showSaved(savedOk ? record : null);
      setStatus('Done.');
    }
    startBtn.disabled = false;
    startBtn.textContent = 'Run again';
  };

  const start = async () => {
    startBtn.disabled = true;
    result.hidden = true;
    setStatus('Opening microphone…');
    try {
      if (!mic) mic = await openMic();
      if (disposed) {
        await mic.close();
        return;
      }
      deviceKey = mic.track.getSettings().deviceId || 'default';
      showSaved(store.load(deviceKey));
      const ctx = mic.ctx;
      // What the browser says the output path costs: stops a slow (Bluetooth) output being paired
      // with the next click instead of its own.
      const prior = defaultOffsetFromLatencies({
        baseLatency: ctx.baseLatency,
        outputLatency: ctx.outputLatency,
      });
      const plan = planCalibration(ctx.currentTime + 1.2);
      const onsets: number[] = [];
      mic.onMessage = (m) => {
        if (m.type === 'input') onsets.push(m.event.time);
      };
      stopClicks = scheduleClicks(ctx, plan.clicks);
      const lastClick = plan.clicks[plan.clicks.length - 1]!;
      let done = false;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        const now = ctx.currentTime;
        let idx = -1;
        for (let i = 0; i < plan.clicks.length; i++) if (plan.clicks[i]! <= now) idx = i;
        const sinceClick = idx >= 0 ? now - plan.clicks[idx]! : Infinity;
        beat.className = `beat${sinceClick < 0.12 ? ' on' : ''}`;
        if (now < plan.clicks[0]!) setStatus('Get ready…');
        else if (idx < plan.quiet) setStatus(`Listen: stay quiet (${idx + 1}/${plan.quiet})`);
        else
          setStatus(
            `Now clap on every click (${idx - plan.quiet + 1}/${plan.clicks.length - plan.quiet})`,
          );
        if (!done && now > lastClick + 0.8) {
          done = true;
          finish(plan, onsets, prior);
        }
      };
      raf = requestAnimationFrame(tick);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err), true);
      startBtn.disabled = false;
    }
  };

  if (!micSupported()) {
    startBtn.disabled = true;
    setStatus('This browser lacks microphone or AudioWorklet support.', true);
  }
  startBtn.addEventListener('click', () => void start());
  resetBtn.addEventListener('click', () => {
    store.clear(deviceKey);
    showSaved(null);
    setStatus('Forgot the saved calibration (the device estimate will be used).');
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    stopClicks?.();
    void mic?.close();
  };
};
