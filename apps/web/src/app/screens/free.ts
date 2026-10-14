import { audioConstraints } from '@lineup/input';
import { scheduleClicks } from '../audio';
import {
  BPM_RANGE,
  clampBpm,
  clicksBetween,
  clock,
  extensionFor,
  pickRecordingType,
} from '../free-play';
import { describeError } from '../mic-error';
import type { Screen } from '../router';

/** How far ahead the metronome schedules its clicks, and how often it looks, seconds. */
const LOOKAHEAD_S = 0.2;
const TICK_MS = 25;

/**
 * Free play: a metronome and a take recorded and played back on this device, with no song and no
 * score. The recording never leaves the device; it is gone when the page is left unless saved.
 */
export const freeScreen: Screen = (root) => {
  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Free play</h1>
    <div class="banner warn">
      <strong>Use headphones</strong> when the metronome is on, or the recording will pick up the clicks.
    </div>
    <section class="panel">
      <h2>Metronome</h2>
      <div class="row">
        <label>Tempo <input data-id="bpm" type="number" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" value="100" /></label>
        <label>Beats to the bar <select data-id="beats">
          <option value="2">2</option><option value="3">3</option><option value="4" selected>4</option><option value="6">6</option>
        </select></label>
        <button data-id="click-toggle">▶ Start metronome</button>
      </div>
    </section>
    <section class="panel">
      <h2>Record a take</h2>
      <div class="row">
        <label class="check"><input type="checkbox" data-id="with-click" checked /> Use the metronome (one bar of count-in first)</label>
      </div>
      <div class="row">
        <button class="primary" data-id="record">● Record</button>
        <button data-id="stop" disabled>■ Stop</button>
      </div>
      <p class="status" data-id="status" role="status">Tap Record, then play. Nothing leaves this device.</p>
      <div class="meter-bar" aria-hidden="true"><span data-id="level"></span></div>
      <div data-id="take" hidden>
        <h3>Your take <small data-id="length"></small></h3>
        <audio controls data-id="player"></audio>
        <div class="row">
          <a class="button" data-id="save" download>Save to this device</a>
          <button data-id="discard">Discard</button>
        </div>
      </div>
    </section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const bpmInput = $<HTMLInputElement>('bpm');
  const beatsSel = $<HTMLSelectElement>('beats');
  const toggle = $<HTMLButtonElement>('click-toggle');
  const withClick = $<HTMLInputElement>('with-click');
  const recordBtn = $<HTMLButtonElement>('record');
  const stopBtn = $<HTMLButtonElement>('stop');
  const status = $('status');

  let ctx: AudioContext | null = null;
  let metro: { timer: ReturnType<typeof setInterval>; start: number; until: number } | null = null;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let takeUrl: string | null = null;
  let recordStartedAt = 0;
  let countTimer: ReturnType<typeof setTimeout> | undefined;
  let lengthTimer: ReturnType<typeof setInterval> | undefined;
  let meterRaf = 0;
  let disposed = false;

  const bpm = () => clampBpm(Number(bpmInput.value));
  const beats = () => Number(beatsSel.value) || 4;

  const audioCtx = (): AudioContext => {
    ctx ??= new AudioContext();
    void ctx.resume();
    return ctx;
  };

  /** Starts clicking on a beat at `start` (audio clock seconds); `lookahead` keeps the clicks steady. */
  const startMetronome = (start: number): void => {
    stopMetronome();
    const c = audioCtx();
    const state = { timer: 0 as unknown as ReturnType<typeof setInterval>, start, until: start };
    const pump = () => {
      const to = c.currentTime + LOOKAHEAD_S;
      const clicks = clicksBetween(state.start, bpm(), beats(), state.until, to);
      // a tempo change mid-way restarts the grid from the next click, so the beat never lurches
      scheduleClicks(
        c,
        clicks.filter((k) => k.accent).map((k) => k.time),
        { hz: 1500 },
      );
      scheduleClicks(
        c,
        clicks.filter((k) => !k.accent).map((k) => k.time),
        { hz: 1000, gain: 0.3 },
      );
      state.until = Math.max(state.until, to);
    };
    state.timer = setInterval(pump, TICK_MS);
    metro = state;
    pump();
    toggle.textContent = '■ Stop metronome';
  };

  const stopMetronome = (): void => {
    if (metro) clearInterval(metro.timer);
    metro = null;
    toggle.textContent = '▶ Start metronome';
  };

  // changing the tempo while it clicks: continue from the next beat on the new grid
  const retime = (): void => {
    if (!metro || !ctx) return;
    startMetronome(Math.max(ctx.currentTime + 0.05, metro.until));
  };
  bpmInput.addEventListener('change', () => {
    bpmInput.value = String(bpm());
    retime();
  });
  beatsSel.addEventListener('change', retime);
  toggle.addEventListener('click', () => {
    if (metro) stopMetronome();
    else startMetronome(audioCtx().currentTime + 0.1);
  });

  const clearTake = (): void => {
    if (takeUrl) URL.revokeObjectURL(takeUrl);
    takeUrl = null;
    $('take').hidden = true;
  };

  const stopMeter = (): void => {
    cancelAnimationFrame(meterRaf);
    $('level').style.width = '0%';
  };

  const watchLevel = (source: MediaStream): void => {
    const c = audioCtx();
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    c.createMediaStreamSource(source).connect(analyser);
    const data = new Float32Array(analyser.fftSize);
    const draw = () => {
      meterRaf = requestAnimationFrame(draw);
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += v * v;
      const db = 20 * Math.log10(Math.sqrt(sum / data.length) + 1e-9);
      $('level').style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
    };
    draw();
  };

  const finishRecording = (type: string): void => {
    const blob = new Blob(chunks, { type: type || chunks[0]?.type || 'audio/webm' });
    chunks = [];
    if (blob.size === 0) {
      status.textContent = 'Nothing was recorded. Try again.';
      return;
    }
    clearTake();
    takeUrl = URL.createObjectURL(blob);
    const player = $<HTMLAudioElement>('player');
    player.src = takeUrl;
    const save = $<HTMLAnchorElement>('save');
    save.href = takeUrl;
    save.download = `take.${extensionFor(blob.type)}`;
    $('take').hidden = false;
    $('length').textContent = `(${clock((Date.now() - recordStartedAt) / 1000)})`;
    status.textContent = 'Recorded. Play it back below.';
  };

  const endTake = (): void => {
    clearTimeout(countTimer);
    clearInterval(lengthTimer);
    stopMeter();
    stopMetronome();
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    else for (const t of stream?.getTracks() ?? []) t.stop();
    recordBtn.disabled = false;
    stopBtn.disabled = true;
  };

  recordBtn.addEventListener('click', async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'This browser cannot record. Try Safari or Chrome.';
      return;
    }
    recordBtn.disabled = true;
    status.textContent = 'Opening microphone…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    } catch (err) {
      status.textContent = describeError(err);
      recordBtn.disabled = false;
      return;
    }
    if (disposed) {
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    clearTake();
    watchLevel(stream);
    const type = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const mine = recorder;
    recorder.onstop = () => {
      for (const t of stream?.getTracks() ?? []) t.stop();
      if (!disposed && recorder === mine) finishRecording(mine.mimeType || type);
    };
    stopBtn.disabled = false;
    const begin = () => {
      recordStartedAt = Date.now();
      recorder?.start();
      status.textContent = 'Recording… tap Stop when you are done.';
      lengthTimer = setInterval(() => {
        status.textContent = `Recording… ${clock((Date.now() - recordStartedAt) / 1000)}`;
      }, 500);
    };
    if (withClick.checked) {
      const c = audioCtx();
      const start = c.currentTime + 0.2;
      startMetronome(start);
      const countIn = (beats() * 60) / bpm();
      status.textContent = 'Count-in…';
      countTimer = setTimeout(begin, (0.2 + countIn) * 1000);
    } else begin();
  });
  stopBtn.addEventListener('click', endTake);
  $('discard').addEventListener('click', () => {
    clearTake();
    status.textContent = 'Discarded. Tap Record for another take.';
  });

  return () => {
    disposed = true;
    clearTimeout(countTimer);
    clearInterval(lengthTimer);
    stopMeter();
    stopMetronome();
    recorder = null;
    for (const t of stream?.getTracks() ?? []) t.stop();
    clearTake();
    if (ctx) void ctx.close();
  };
};
