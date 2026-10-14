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
    const player = $<HTMLAudioElement>('player');
    player.pause();
    player.removeAttribute('src');
    player.load();
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

  /** Puts the screen back to idle: timers, meter, metronome and controls. Safe to call twice. */
  const settle = (): void => {
    clearTimeout(countTimer);
    clearInterval(lengthTimer);
    stopMeter();
    stopMetronome();
    stopBtn.disabled = true;
    recordBtn.disabled = false;
  };

  /** Stop was tapped: the recorder's own stop event finishes the take and settles the screen. */
  const endTake = (): void => {
    clearTimeout(countTimer);
    if (recorder && recorder.state !== 'inactive') {
      stopBtn.disabled = true;
      recordBtn.disabled = true; // until the take is made, so a new one cannot start over it
      recorder.stop();
    } else {
      for (const t of stream?.getTracks() ?? []) t.stop();
      settle();
    }
  };

  /** Ends a take that could not start or carry on: release the mic and say why. */
  const abandon = (message: string, tracks: MediaStream | null): void => {
    for (const t of tracks?.getTracks() ?? []) t.stop();
    recorder = null;
    settle();
    status.textContent = message;
  };

  recordBtn.addEventListener('click', async () => {
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      status.textContent = 'This browser cannot record. Try Safari or Chrome.';
      return;
    }
    recordBtn.disabled = true;
    status.textContent = 'Opening microphone…';
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints() });
    } catch (err) {
      status.textContent = describeError(err);
      recordBtn.disabled = false;
      return;
    }
    if (disposed) {
      for (const t of mic.getTracks()) t.stop();
      return;
    }
    stream = mic;
    clearTake();
    const type = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    // this take's own recorder and pieces, so an earlier take cannot touch it
    const pieces: Blob[] = [];
    let rec: MediaRecorder;
    try {
      watchLevel(mic);
      rec = new MediaRecorder(mic, type ? { mimeType: type } : undefined);
    } catch (err) {
      abandon(`Could not start recording: ${describeError(err)}`, mic);
      return;
    }
    recorder = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) pieces.push(e.data);
    };
    rec.onstop = () => {
      for (const t of mic.getTracks()) t.stop();
      // also reached when the mic disappears without Stop being tapped
      settle();
      if (disposed || recorder !== rec) return;
      chunks = pieces;
      finishRecording(rec.mimeType || type);
    };
    stopBtn.disabled = false;
    const begin = () => {
      recordStartedAt = Date.now();
      try {
        rec.start();
      } catch (err) {
        abandon(`Could not start recording: ${describeError(err)}`, mic);
        return;
      }
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
