import { nearestOpenString, noteFromFrequency, type InputEvent } from '@lineup/core';
import {
  constraintReport,
  type AnalysisFrame,
  type ChannelSelection,
  type ConstraintRow,
} from '@lineup/input';
import { listAudioInputs, micSupported, openMic, type MicSession } from '@lineup/input/mic';
import { drawMeter, drawWaveform } from '@lineup/render';
import { buildInfoText } from '../build-info';
import { formatCents, formatDb, formatMs } from '../format';
import type { Screen } from '../router';

/** How long the last detected pitch stays on screen after the note stops. */
const PITCH_HOLD_S = 0.4;
const CLIP_HOLD_S = 1.5;

const CONSTRAINT_LABELS: Record<ConstraintRow['key'], string> = {
  echoCancellation: 'Echo cancellation',
  noiseSuppression: 'Noise suppression',
  autoGainControl: 'Auto gain control',
};

const TEMPLATE = `
  <p><a href="#/">← Back</a></p>
  <h1>Mic &amp; latency test</h1>
  <div class="row">
    <button data-id="start">Start mic</button>
    <button data-id="stop" disabled>Stop</button>
    <button data-id="resume" hidden>Resume audio</button>
  </div>
  <div class="row">
    <label>Input <select data-id="device"><option value="">Default</option></select></label>
    <label>Channel <select data-id="channel" disabled>
      <option value="0">1</option>
    </select></label>
  </div>
  <p class="status" data-id="status">Tap “Start mic”. Safari will ask for microphone access.</p>

  <section class="grid">
    <div class="panel">
      <h2>Pitch</h2>
      <div class="note" data-id="note">–</div>
      <div class="cents"><div class="cents-needle" data-id="needle"></div></div>
      <dl>
        <dt>Frequency</dt><dd data-id="hz">–</dd>
        <dt>Cents</dt><dd data-id="cents">–</dd>
        <dt>Nearest string</dt><dd data-id="string">–</dd>
        <dt>Clarity</dt><dd data-id="clarity">–</dd>
      </dl>
    </div>
    <div class="panel">
      <h2>Level</h2>
      <canvas class="meter" data-id="meter"></canvas>
      <dl>
        <dt>RMS</dt><dd data-id="rms">–</dd>
        <dt>Peak</dt><dd data-id="peak">–</dd>
        <dt>Clipping</dt><dd data-id="clip">–</dd>
      </dl>
      <h2>Onsets</h2>
      <div class="onset-row"><span class="onset-dot" data-id="dot"></span>
        <span data-id="onsets">0</span> detected</div>
      <dl>
        <dt>Last velocity</dt><dd data-id="velocity">–</dd>
        <dt>Detect → screen</dt><dd data-id="lag">–</dd>
      </dl>
    </div>
  </section>

  <div class="panel">
    <h2>Waveform</h2>
    <canvas class="scope" data-id="scope"></canvas>
  </div>

  <section class="grid">
    <div class="panel">
      <h2>Audio context</h2>
      <dl data-id="ctx-info"><dt>Not started</dt><dd></dd></dl>
    </div>
    <div class="panel">
      <h2>Voice processing <small>(requested: all off)</small></h2>
      <dl data-id="constraints"><dt>Not started</dt><dd></dd></dl>
    </div>
  </section>
  <div class="row">
    <button data-id="copy" disabled>Copy diagnostics</button>
  </div>
`;

export const micTestScreen: Screen = (root) => {
  root.innerHTML = TEMPLATE;
  const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const el = root.querySelector<T>(`[data-id="${id}"]`);
    if (!el) throw new Error(`missing [data-id=${id}]`);
    return el;
  };

  const startBtn = $<HTMLButtonElement>('start');
  const stopBtn = $<HTMLButtonElement>('stop');
  const resumeBtn = $<HTMLButtonElement>('resume');
  const copyBtn = $<HTMLButtonElement>('copy');
  const deviceSel = $<HTMLSelectElement>('device');
  const channelSel = $<HTMLSelectElement>('channel');
  const status = $('status');
  const scope = $<HTMLCanvasElement>('scope');
  const meter = $<HTMLCanvasElement>('meter');

  let session: MicSession | null = null;
  let raf = 0;
  let disposed = false;
  let waveform = new Float32Array(2048);

  // Latest analysis state, written by worklet messages, read on rAF.
  let lastFrame: AnalysisFrame | null = null;
  let lastVoiced: AnalysisFrame | null = null;
  let peakHold = -120;
  let clipUntil = -Infinity;
  let onsetCount = 0;
  let lastOnset: InputEvent | null = null;
  const lags: number[] = [];

  const setStatus = (text: string, kind: 'info' | 'error' = 'info') => {
    status.textContent = text;
    status.classList.toggle('error', kind === 'error');
  };

  const refreshDevices = async () => {
    try {
      const inputs = await listAudioInputs();
      const current = deviceSel.value;
      deviceSel.replaceChildren(new Option('Default', ''));
      inputs.forEach((d, i) => {
        if (d.deviceId === 'default' || !d.deviceId) return;
        deviceSel.add(new Option(d.label || `Input ${i + 1}`, d.deviceId));
      });
      deviceSel.value = [...deviceSel.options].some((o) => o.value === current) ? current : '';
    } catch {
      // Device listing is a nicety; the default input still works.
    }
  };

  const onMessage = (ctx: AudioContext) => (msg: Parameters<MicSession['onMessage']>[0]) => {
    if (msg.type === 'frame') {
      lastFrame = msg.frame;
      if (msg.frame.pitchHz !== null) lastVoiced = msg.frame;
      peakHold = Math.max(peakHold, msg.frame.peakDb);
      if (msg.frame.peakDb > -0.5) clipUntil = msg.frame.time + CLIP_HOLD_S;
    } else {
      onsetCount++;
      lastOnset = msg.event;
      lags.push(ctx.currentTime - msg.event.time);
      if (lags.length > 10) lags.shift();
    }
  };

  const renderCtxInfo = (s: MicSession) => {
    const { ctx, track } = s;
    const settings = track.getSettings() as MediaTrackSettings & { latency?: number };
    const audioSession = (navigator as Navigator & { audioSession?: { type?: string } })
      .audioSession;
    const rows: [string, string][] = [
      ['State', ctx.state],
      ['currentTime', `${ctx.currentTime.toFixed(3)} s`],
      ['Context sampleRate', `${ctx.sampleRate} Hz`],
      ['Mic sampleRate', settings.sampleRate ? `${settings.sampleRate} Hz` : 'n/a'],
      ['baseLatency', formatMs(ctx.baseLatency)],
      ['outputLatency', formatMs(ctx.outputLatency)],
      ['Mic latency (reported)', formatMs(settings.latency)],
      ['Channels', String(settings.channelCount ?? 'n/a')],
      ['Device', track.label || 'n/a'],
      ['audioSession.type', audioSession?.type ?? 'n/a'],
    ];
    if (settings.sampleRate && settings.sampleRate !== ctx.sampleRate) {
      rows.push(['⚠️ Rate mismatch', 'Browser is resampling the mic']);
    }
    $('ctx-info').innerHTML = rows
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
      .join('');
  };

  const renderConstraints = (s: MicSession) => {
    const rows = constraintReport(
      s.track.getSettings(),
      navigator.mediaDevices.getSupportedConstraints(),
    );
    const badge: Record<ConstraintRow['status'], string> = {
      off: '<span class="badge ok">OFF ✓</span>',
      on: '<span class="badge bad">ON ✗</span>',
      unreported: '<span class="badge warn">not reported</span>',
    };
    $('constraints').innerHTML = rows
      .map(
        (r) =>
          `<dt>${CONSTRAINT_LABELS[r.key]}</dt><dd>${badge[r.status]}${
            r.supported ? '' : ' <small>(constraint unsupported)</small>'
          }</dd>`,
      )
      .join('');
  };

  const renderChannels = (s: MicSession) => {
    const count = s.track.getSettings().channelCount ?? 1;
    const current = channelSel.value;
    channelSel.replaceChildren();
    for (let i = 0; i < count; i++) channelSel.add(new Option(String(i + 1), String(i)));
    if (count > 1) channelSel.add(new Option('Mix all', 'mix'));
    channelSel.value = [...channelSel.options].some((o) => o.value === current) ? current : '0';
    channelSel.disabled = count < 2;
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const s = session;
    if (!s) return;
    const now = s.ctx.currentTime;

    if (waveform.length !== s.analyser.fftSize) waveform = new Float32Array(s.analyser.fftSize);
    s.analyser.getFloatTimeDomainData(waveform);
    drawWaveform(scope, waveform, '#06d6a0');

    const frame = lastFrame;
    if (frame) {
      drawMeter(meter, frame.rmsDb, peakHold, { bar: '#118ab2', peak: '#ffd166', hot: '#ef476f' });
      $('rms').textContent = formatDb(frame.rmsDb);
      $('peak').textContent = formatDb(peakHold);
      $('clarity').textContent = frame.clarity.toFixed(2);
      peakHold = Math.max(frame.peakDb, peakHold - 0.5);
    }
    const clipping = now < clipUntil;
    $('clip').innerHTML = clipping
      ? '<span class="badge bad">CLIP – turn input gain down</span>'
      : '<span class="badge ok">no</span>';

    const voiced = lastVoiced && now - lastVoiced.time < PITCH_HOLD_S ? lastVoiced : null;
    if (voiced?.pitchHz) {
      const note = noteFromFrequency(voiced.pitchHz);
      const open = nearestOpenString(voiced.pitchHz);
      $('note').textContent = note.label;
      $('hz').textContent = `${voiced.pitchHz.toFixed(1)} Hz`;
      $('cents').textContent = formatCents(note.cents);
      $('needle').style.left = `${50 + note.cents}%`;
      $('needle').classList.toggle('in-tune', Math.abs(note.cents) < 5);
      $('string').textContent = `${open.string.label} ${formatCents(open.cents)}`;
    } else {
      $('note').textContent = '–';
      $('needle').style.left = '50%';
      $('needle').classList.remove('in-tune');
    }

    $('onsets').textContent = String(onsetCount);
    $('dot').classList.toggle('lit', !!lastOnset && now - lastOnset.time < 0.12);
    if (lastOnset) $('velocity').textContent = (lastOnset.velocity ?? 0).toFixed(2);
    if (lags.length) {
      const avg = lags.reduce((a, b) => a + b, 0) / lags.length;
      $('lag').textContent = `${formatMs(avg)} avg of ${lags.length}`;
    }
    // Cheap to refresh, and shows state changes / the clock ticking.
    renderCtxInfo(s);
  };

  const stop = async () => {
    const s = session;
    session = null;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    resumeBtn.hidden = true;
    if (s) await s.close();
  };

  const start = async () => {
    await stop();
    startBtn.disabled = true;
    setStatus('Opening microphone…');
    try {
      const channel: ChannelSelection =
        channelSel.value === 'mix' ? 'mix' : Number(channelSel.value) || 0;
      const s = await openMic(deviceSel.value || undefined, channel);
      if (disposed) {
        await s.close();
        return;
      }
      session = s;
      s.onMessage = onMessage(s.ctx);
      s.track.addEventListener('ended', () => {
        setStatus('Input disconnected. Tap “Start mic” again.', 'error');
        void stop();
      });
      s.ctx.addEventListener('statechange', () => {
        resumeBtn.hidden = s.ctx.state === 'running' || s.ctx.state === 'closed';
      });
      resumeBtn.hidden = s.ctx.state === 'running';
      stopBtn.disabled = false;
      copyBtn.disabled = false;
      renderConstraints(s);
      renderChannels(s);
      await refreshDevices();
      setStatus(
        s.ctx.state === 'running'
          ? 'Listening. Pluck a string.'
          : `Audio is “${s.ctx.state}”. Tap “Resume audio”.`,
      );
    } catch (err) {
      startBtn.disabled = false;
      setStatus(describeError(err), 'error');
    }
  };

  startBtn.addEventListener('click', () => void start());
  stopBtn.addEventListener('click', () => {
    void stop();
    setStatus('Stopped.');
  });
  resumeBtn.addEventListener('click', () => {
    void session?.ctx.resume();
  });
  deviceSel.addEventListener('change', () => {
    if (session) void start();
  });
  channelSel.addEventListener('change', () => {
    session?.setChannel(channelSel.value === 'mix' ? 'mix' : Number(channelSel.value));
  });
  copyBtn.addEventListener('click', () => {
    if (!session) return;
    const text = JSON.stringify(diagnostics(session), null, 2);
    navigator.clipboard.writeText(text).then(
      () => setStatus('Diagnostics copied. Paste them into a PR comment.'),
      () => setStatus('Copy failed. Clipboard access was blocked.', 'error'),
    );
  });
  const onDeviceChange = () => void refreshDevices();
  navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

  if (!micSupported()) {
    startBtn.disabled = true;
    setStatus(
      'This browser lacks getUserMedia or AudioWorklet. Use Safari 14.5+ or Chrome, over HTTPS.',
      'error',
    );
  }
  raf = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    void stop();
  };
};

function diagnostics(s: MicSession) {
  const { ctx, track } = s;
  const supported = navigator.mediaDevices.getSupportedConstraints();
  return {
    build: buildInfoText(),
    userAgent: navigator.userAgent,
    standalone: matchMedia('(display-mode: standalone)').matches,
    context: {
      state: ctx.state,
      sampleRate: ctx.sampleRate,
      baseLatency: ctx.baseLatency ?? null,
      outputLatency: ctx.outputLatency ?? null,
    },
    track: { label: track.label, settings: track.getSettings() },
    constraints: constraintReport(track.getSettings(), supported),
  };
}

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return 'Microphone permission denied. In Safari, tap aA → Website Settings → Microphone → Allow, then reload.';
      case 'NotFoundError':
        return 'No microphone found.';
      case 'NotReadableError':
        return 'The microphone is busy or unavailable (another app may be using it).';
      case 'OverconstrainedError':
        return 'That input device is no longer available. Pick another one.';
    }
    return `${err.name}: ${err.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
