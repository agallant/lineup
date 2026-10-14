import { micSupported, openMic, type MicSession } from '@lineup/input/mic';
import { escapeHtml } from '../audio';
import { describeError } from '../mic-error';
import type { Screen } from '../router';
import { safeLocalStorage } from '../settings';
import {
  A4_RANGE,
  DEFAULT_A4,
  NOTE_NAMES,
  PitchSmoother,
  TUNINGS,
  TUNING_GROUPS,
  clampA4,
  noteHz,
  readTuner,
  tunerPitchOptions,
} from '../tuner';

/** How long a reading stays on screen after the note stops. */
const HOLD_S = 0.6;
/** A needle at the end of the scale is 50 cents out. */
const FULL_SCALE_CENTS = 50;
/** The key the tuner's own choices are kept under. */
const STORE_KEY = 'lineup.tuner.v1';
/** The octaves a reference tone can be played in. */
const OCTAVES = { min: 1, max: 7 } as const;

interface Saved {
  tuning: string;
  a4: number;
  octave: number;
}

function loadSaved(): Saved {
  const fallback: Saved = { tuning: 'chromatic', a4: DEFAULT_A4, octave: 4 };
  try {
    const r = JSON.parse(safeLocalStorage()?.getItem(STORE_KEY) ?? 'null') as Partial<Saved> | null;
    if (!r || typeof r !== 'object') return fallback;
    return {
      tuning: TUNINGS.some((t) => t.id === r.tuning) ? r.tuning! : fallback.tuning,
      a4: typeof r.a4 === 'number' ? clampA4(r.a4) : fallback.a4,
      octave:
        typeof r.octave === 'number'
          ? Math.min(OCTAVES.max, Math.max(OCTAVES.min, Math.round(r.octave)))
          : fallback.octave,
    };
  } catch {
    return fallback;
  }
}

/** A universal tuner: hear any note, see how far off it is, and hear a reference tone to tune to. */
export const tunerScreen: Screen = (root) => {
  const saved = loadSaved();
  const save = () => {
    try {
      safeLocalStorage()?.setItem(STORE_KEY, JSON.stringify(saved));
    } catch {
      // storage blocked: the choices last for this visit only
    }
  };

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Tuner</h1>
    <section class="panel tuner-main">
      <div class="note" data-id="note" aria-live="polite">–</div>
      <p class="tuner-sub" data-id="detail">Play or sing one note at a time</p>
      <div class="cents"><div class="cents-needle" data-id="needle"></div></div>
      <p class="big" data-id="advice" role="status">Waiting for a note</p>
      <div class="row">
        <button data-id="start" class="primary">Start tuner</button>
        <button data-id="stop" disabled>Stop</button>
      </div>
      <p class="status" data-id="status" role="status">Tap “Start tuner” and allow the microphone. It listens for one note at a time: voice, whistle, flute, strings, anything.</p>
    </section>
    <section class="panel">
      <h2>Reference tone <small>(hear the note to tune to)</small></h2>
      <div class="row" data-id="refs" role="group" aria-label="Reference notes"></div>
      <div class="row" data-id="octave-row">
        <span>Octave</span>
        <button data-id="oct-down" aria-label="Octave down">−</button>
        <strong data-id="oct" aria-live="polite"></strong>
        <button data-id="oct-up" aria-label="Octave up">+</button>
        <button data-id="tone-stop" disabled>Stop tone</button>
      </div>
      <p class="muted">Tap a note to hold it; tap it again, or another note, to change it. Use headphones when the microphone is on, or the tuner will hear the tone.</p>
    </section>
    <section class="panel">
      <h2>Settings</h2>
      <div class="row">
        <label>Tuner for
          <select data-id="tuning">${TUNING_GROUPS.map(
            (g) =>
              `<optgroup label="${escapeHtml(g.label)}">${g.ids
                .map((id) => {
                  const t = TUNINGS.find((x) => x.id === id)!;
                  return `<option value="${t.id}">${escapeHtml(t.label)}</option>`;
                })
                .join('')}</optgroup>`,
          ).join('')}</select>
        </label>
        <label data-id="target-label">String
          <select data-id="target"><option value="">Nearest (automatic)</option></select>
        </label>
      </div>
      <div class="row">
        <span>A =</span>
        <button data-id="a4-down" aria-label="Lower the reference pitch by 1 hertz">−</button>
        <strong data-id="a4"></strong>
        <button data-id="a4-up" aria-label="Raise the reference pitch by 1 hertz">+</button>
        <button data-id="a4-reset">440</button>
      </div>
    </section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const tuningSel = $<HTMLSelectElement>('tuning');
  const targetSel = $<HTMLSelectElement>('target');
  const startBtn = $<HTMLButtonElement>('start');
  const stopBtn = $<HTMLButtonElement>('stop');
  const needle = $('needle');
  const toneStop = $<HTMLButtonElement>('tone-stop');

  let session: MicSession | null = null;
  let disposed = false;
  let raf = 0;
  let last: { hz: number; at: number } | null = null;
  const smoother = new PitchSmoother();
  /** The steadied pitch and the needle's position, eased toward it every frame. */
  let needleCents = 0;
  let shown = false;

  const tuning = () => TUNINGS.find((t) => t.id === tuningSel.value) ?? TUNINGS[0]!;

  // ------------------------------------------------------------ reference tones

  let own: AudioContext | null = null;
  let tone: { osc: OscillatorNode[]; gain: GainNode; midi: number } | null = null;
  const audio = (): AudioContext => {
    // the open microphone's context if there is one, else one of our own
    const ctx = session?.ctx ?? (own ??= new AudioContext());
    void ctx.resume();
    return ctx;
  };
  const stopTone = () => {
    const t = tone;
    tone = null;
    toneStop.disabled = true;
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-ref]'))
      b.setAttribute('aria-pressed', 'false');
    if (!t) return;
    const ctx = t.gain.context as AudioContext;
    const now = ctx.currentTime;
    t.gain.gain.cancelScheduledValues(now);
    t.gain.gain.setValueAtTime(Math.max(t.gain.gain.value, 0.0002), now);
    t.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    for (const o of t.osc) o.stop(now + 0.2);
  };
  const playTone = (midi: number) => {
    const wasSame = tone?.midi === midi;
    stopTone();
    if (wasSame) return;
    const ctx = audio();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const hz = noteHz(midi, saved.a4);
    // a sine for a clean reference, with a quiet octave above so a small speaker still carries a low note
    const osc = [
      { f: hz, level: 1 },
      { f: hz * 2, level: 0.25 },
    ].map(({ f, level }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = level;
      o.connect(g).connect(gain);
      o.start();
      return o;
    });
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
    tone = { osc, gain, midi };
    toneStop.disabled = false;
    for (const b of root.querySelectorAll<HTMLButtonElement>('[data-ref]'))
      b.setAttribute('aria-pressed', String(Number(b.dataset['ref']) === midi));
  };
  toneStop.addEventListener('click', stopTone);

  /** The reference buttons: the twelve notes of the chosen octave, or the strings of the instrument. */
  const showRefs = () => {
    const refs = $('refs');
    refs.replaceChildren();
    const t = tuning();
    const items =
      t.strings.length === 0
        ? NOTE_NAMES.map((n, i) => ({
            label: n,
            midi: 12 * (saved.octave + 1) + i,
            aria: `Play ${n}${saved.octave}`,
          }))
        : t.strings.map((s) => ({ label: s.name, midi: s.midi, aria: `Play the note ${s.name}` }));
    for (const it of items) {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.dataset['ref'] = String(it.midi);
      b.setAttribute('aria-label', it.aria);
      b.setAttribute('aria-pressed', String(tone?.midi === it.midi));
      b.addEventListener('click', () => playTone(it.midi));
      refs.appendChild(b);
    }
    $('octave-row').hidden = t.strings.length > 0;
    $('oct').textContent = String(saved.octave);
  };

  const showTargets = () => {
    // choose the string you are tuning when it is far from where it should be
    targetSel.replaceChildren(new Option('Nearest (automatic)', ''));
    for (const s of tuning().strings) targetSel.add(new Option(s.name, s.name));
    $('target-label').hidden = tuning().strings.length === 0;
  };

  const showA4 = () => {
    $('a4').textContent = `${saved.a4} Hz`;
    $<HTMLButtonElement>('a4-down').disabled = saved.a4 <= A4_RANGE.min;
    $<HTMLButtonElement>('a4-up').disabled = saved.a4 >= A4_RANGE.max;
  };
  const setA4 = (hz: number) => {
    saved.a4 = clampA4(hz);
    save();
    showA4();
    // a held tone follows the new reference
    if (tone) {
      const midi = tone.midi;
      stopTone();
      playTone(midi);
    }
  };
  $('a4-down').addEventListener('click', () => setA4(saved.a4 - 1));
  $('a4-up').addEventListener('click', () => setA4(saved.a4 + 1));
  $('a4-reset').addEventListener('click', () => setA4(DEFAULT_A4));
  const setOctave = (o: number) => {
    saved.octave = Math.min(OCTAVES.max, Math.max(OCTAVES.min, o));
    save();
    stopTone();
    showRefs();
  };
  $('oct-down').addEventListener('click', () => setOctave(saved.octave - 1));
  $('oct-up').addEventListener('click', () => setOctave(saved.octave + 1));

  tuningSel.value = saved.tuning;
  showTargets();
  showRefs();
  showA4();
  tuningSel.addEventListener('change', () => {
    saved.tuning = tuningSel.value;
    save();
    stopTone();
    smoother.reset();
    showTargets();
    showRefs();
    // a bass needs a different listening range, so a running microphone is reopened
    if (session) startBtn.click();
  });

  // ------------------------------------------------------------ reading

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const s = session;
    if (!s) return;
    const fresh = last && s.ctx.currentTime - last.at < HOLD_S ? last : null;
    const reading = fresh
      ? readTuner(fresh.hz, tuning(), targetSel.value || undefined, saved.a4)
      : null;
    if (!reading) {
      if (shown) {
        shown = false;
        $('note').textContent = '–';
        $('detail').textContent = 'Play or sing one note at a time';
        $('advice').textContent = 'Waiting for a note';
        needle.classList.remove('in-tune');
      }
      // glide back to the middle, not a jump
      needleCents *= 0.85;
      needle.style.left = `${50 + (needleCents / FULL_SCALE_CENTS) * 50}%`;
      return;
    }
    shown = true;
    $('note').textContent = reading.name;
    const hz = fresh!.hz;
    $('detail').textContent =
      `${hz.toFixed(1)} Hz · ${reading.cents >= 0 ? '+' : '−'}${Math.abs(reading.cents).toFixed(0)} cents`;
    $('advice').textContent = reading.advice;
    const clamped = Math.max(-FULL_SCALE_CENTS, Math.min(FULL_SCALE_CENTS, reading.cents));
    // ease toward the reading so the needle moves smoothly
    needleCents += (clamped - needleCents) * 0.35;
    needle.style.left = `${50 + (needleCents / FULL_SCALE_CENTS) * 50}%`;
    needle.classList.toggle('in-tune', reading.state === 'in-tune');
  };
  raf = requestAnimationFrame(tick);

  const stop = async () => {
    const s = session;
    session = null;
    last = null;
    smoother.reset();
    // a tone playing on the microphone's own audio context goes with it
    if (s && tone && tone.gain.context === s.ctx) stopTone();
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
        const s = await openMic(undefined, 0, { pitch: tunerPitchOptions(tuning()) });
        if (disposed) {
          await s.close();
          return;
        }
        session = s;
        s.onMessage = (m) => {
          if (m.type === 'frame' && m.frame.pitchHz !== null && m.frame.clarity > 0.8) {
            last = { hz: smoother.push(m.frame.pitchHz, m.frame.time), at: m.frame.time };
          }
        };
        stopBtn.disabled = false;
        $('status').textContent = 'Listening. Play or sing one note.';
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
      'This browser lacks getUserMedia or AudioWorklet. Use Safari 14.5+ or Chrome, over HTTPS. The reference tones still work.';
  }

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    stopTone();
    if (own) void own.close();
    void stop();
  };
};
