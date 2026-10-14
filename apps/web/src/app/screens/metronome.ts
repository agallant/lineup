import { playClick } from '../metronome-sound';
import {
  BPM_RANGE,
  MAX_BEATS,
  MetronomeScheduler,
  MetronomeStore,
  SOUNDS,
  SUBDIVISIONS,
  TapTempo,
  clampBpm,
  nextLevel,
  resizePattern,
  tempoName,
  type BeatLevel,
  type Click,
  type MetronomeConfig,
} from '../metronome';
import { escapeHtml } from '../audio';
import type { Screen } from '../router';
import { safeLocalStorage } from '../settings';

/** How often the scheduler is run, ms. It looks 120 ms ahead, so a late timer never makes a late click. */
const TIMER_MS = 25;
/** The first click comes this long after Start, seconds. */
const LEAD_S = 0.08;

const LEVEL_TEXT: Record<BeatLevel, string> = {
  accent: 'strong',
  normal: 'normal',
  soft: 'soft',
  mute: 'silent',
};

/** A metronome: tempo, tap tempo, bar and accents, subdivisions, sounds, a speed trainer and presets. */
export const metronomeScreen: Screen = (root) => {
  const store = new MetronomeStore(safeLocalStorage());
  const config: MetronomeConfig = store.config();
  const save = () => store.saveConfig(config);

  root.innerHTML = `
    <p><a href="#/">← Home</a></p>
    <h1>Metronome</h1>
    <section class="panel metro-main">
      <div class="metro-tempo">
        <button data-id="bpm-down" class="metro-step" aria-label="Slower by 1">−</button>
        <label class="metro-bpm"><span class="visually-hidden">Beats per minute</span>
          <input data-id="bpm" type="number" inputmode="numeric" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" />
        </label>
        <button data-id="bpm-up" class="metro-step" aria-label="Faster by 1">+</button>
      </div>
      <p class="metro-name" data-id="name"></p>
      <input data-id="bpm-slider" type="range" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" aria-label="Tempo" />
      <div class="row metro-fine">
        <button data-id="bpm-down-5" aria-label="Slower by 5">−5</button>
        <button data-id="tap">Tap tempo</button>
        <button data-id="bpm-up-5" aria-label="Faster by 5">+5</button>
      </div>
      <div class="metro-beats" data-id="beats" role="group" aria-label="The beats of the bar: tap one to change how strong it is"></div>
      <p class="muted" data-id="beat-hint">Tap a beat to change it: strong, normal, soft, silent.</p>
      <button data-id="toggle" class="primary metro-toggle" aria-pressed="false">Start</button>
      <p class="status" data-id="status" role="status"></p>
    </section>
    <section class="panel">
      <h2>Bar and sound</h2>
      <div class="row">
        <span>Beats per bar</span>
        <button data-id="beats-down" aria-label="Fewer beats">−</button>
        <strong data-id="beats-count"></strong>
        <button data-id="beats-up" aria-label="More beats">+</button>
      </div>
      <div class="row">
        <label>Subdivision <select data-id="sub">${SUBDIVISIONS.map(
          (s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`,
        ).join('')}</select></label>
        <label>Sound <select data-id="sound">${SOUNDS.map(
          (s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`,
        ).join('')}</select></label>
      </div>
      <label>Volume <input data-id="volume" type="range" min="0" max="1" step="0.05" /></label>
    </section>
    <section class="panel">
      <details data-id="trainer-box">
        <summary><h2 class="inline">Speed trainer</h2></summary>
        <p class="muted">Gradually speeds up (or slows down) while you play: every few bars the tempo moves toward a target.</p>
        <label class="check"><input type="checkbox" data-id="trainer-on" /> Change the tempo as it plays</label>
        <div class="row">
          <label>By <input data-id="trainer-step" type="number" inputmode="numeric" min="-50" max="50" step="1" /> bpm</label>
          <label>every <input data-id="trainer-bars" type="number" inputmode="numeric" min="1" max="32" step="1" /> bars</label>
          <label>up to <input data-id="trainer-target" type="number" inputmode="numeric" min="${BPM_RANGE.min}" max="${BPM_RANGE.max}" step="1" /> bpm</label>
        </div>
      </details>
    </section>
    <section class="panel">
      <h2>Presets</h2>
      <div class="row">
        <label>Name <input data-id="preset-name" type="text" maxlength="40" placeholder="e.g. Waltz practice" /></label>
        <button data-id="preset-save">Save this set-up</button>
      </div>
      <ul class="menu" data-id="presets"></ul>
    </section>
  `;
  const $ = <T extends HTMLElement>(id: string): T =>
    root.querySelector<T>(`[data-id="${id}"]`) as T;
  const bpmInput = $<HTMLInputElement>('bpm');
  const slider = $<HTMLInputElement>('bpm-slider');
  const toggle = $<HTMLButtonElement>('toggle');

  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let raf = 0;
  let wake: { release(): Promise<void> } | null = null;
  let disposed = false;
  /** Clicks sent to the audio engine, kept until they have been seen, to light the beat in time. */
  let seen: Click[] = [];
  let lit = -1;
  const tap = new TapTempo();

  const sched = new MetronomeScheduler(
    () => config,
    (click) => {
      if (!ctx) return;
      playClick(ctx, click, config.sound, config.volume);
      seen.push(click);
    },
  );

  // ------------------------------------------------------------ display

  const showTempo = () => {
    bpmInput.value = String(config.bpm);
    slider.value = String(config.bpm);
    $('name').textContent = tempoName(config.bpm);
    $<HTMLButtonElement>('bpm-down').disabled = config.bpm <= BPM_RANGE.min;
    $<HTMLButtonElement>('bpm-up').disabled = config.bpm >= BPM_RANGE.max;
  };

  const showBeats = () => {
    const box = $('beats');
    box.replaceChildren();
    config.pattern.forEach((level, i) => {
      const b = document.createElement('button');
      b.className = `metro-beat ${level}`;
      b.dataset['beat'] = String(i);
      b.dataset['level'] = level;
      b.textContent = String(i + 1);
      b.setAttribute('aria-label', `Beat ${i + 1}, ${LEVEL_TEXT[level]}. Tap to change.`);
      b.addEventListener('click', () => {
        config.pattern[i] = nextLevel(config.pattern[i]!);
        save();
        showBeats();
      });
      box.appendChild(b);
    });
    $('beats-count').textContent = String(config.pattern.length);
    $<HTMLButtonElement>('beats-down').disabled = config.pattern.length <= 1;
    $<HTMLButtonElement>('beats-up').disabled = config.pattern.length >= MAX_BEATS;
  };

  const showOptions = () => {
    $<HTMLSelectElement>('sub').value = config.subdivision;
    $<HTMLSelectElement>('sound').value = config.sound;
    $<HTMLInputElement>('volume').value = String(config.volume);
    $<HTMLInputElement>('trainer-on').checked = config.trainer.on;
    $<HTMLInputElement>('trainer-step').value = String(config.trainer.step);
    $<HTMLInputElement>('trainer-bars').value = String(config.trainer.bars);
    $<HTMLInputElement>('trainer-target').value = String(config.trainer.target);
  };

  const showPresets = () => {
    const list = $('presets');
    list.replaceChildren();
    const presets = store.presets();
    if (presets.length === 0) {
      const li = document.createElement('li');
      li.className = 'muted';
      li.textContent = 'None yet. Set the tempo and beats the way you like, name it, and save.';
      list.appendChild(li);
    }
    for (const p of presets) {
      const li = document.createElement('li');
      li.className = 'row metro-preset';
      const use = document.createElement('button');
      use.textContent = `${p.name} · ${p.config.bpm} bpm · ${p.config.pattern.length} beats`;
      use.dataset['preset'] = p.name;
      use.addEventListener('click', () => {
        Object.assign(config, structuredClone(p.config));
        save();
        sched.retune();
        showAll();
      });
      const del = document.createElement('button');
      del.textContent = 'Delete';
      del.setAttribute('aria-label', `Delete the preset ${p.name}`);
      del.addEventListener('click', () => {
        store.deletePreset(p.name);
        showPresets();
      });
      li.append(use, del);
      list.appendChild(li);
    }
  };

  const showAll = () => {
    showTempo();
    showBeats();
    showOptions();
    showPresets();
  };

  // ------------------------------------------------------------ controls

  const setBpm = (bpm: number) => {
    config.bpm = clampBpm(bpm);
    save();
    sched.retune();
    showTempo();
  };
  /** Holding − or + keeps changing the tempo, faster the longer it is held. */
  const repeat = (button: HTMLElement, by: number) => {
    let hold: ReturnType<typeof setTimeout> | undefined;
    const go = (delay: number) => {
      setBpm(config.bpm + by);
      hold = setTimeout(() => go(Math.max(40, delay * 0.8)), delay);
    };
    const end = () => clearTimeout(hold);
    button.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      go(400);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const)
      button.addEventListener(ev, end);
    // a keyboard press (Enter or Space) is a single step
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setBpm(config.bpm + by);
      }
    });
  };
  repeat($('bpm-down'), -1);
  repeat($('bpm-up'), 1);
  $('bpm-down-5').addEventListener('click', () => setBpm(config.bpm - 5));
  $('bpm-up-5').addEventListener('click', () => setBpm(config.bpm + 5));
  slider.addEventListener('input', () => setBpm(Number(slider.value)));
  bpmInput.addEventListener('change', () => setBpm(Number(bpmInput.value)));
  $('tap').addEventListener('click', () => {
    const bpm = tap.tap(performance.now() / 1000);
    if (bpm !== null) setBpm(bpm);
  });

  const setBeats = (n: number) => {
    config.pattern = resizePattern(config.pattern, n);
    save();
    showBeats();
  };
  $('beats-down').addEventListener('click', () => setBeats(config.pattern.length - 1));
  $('beats-up').addEventListener('click', () => setBeats(config.pattern.length + 1));
  $<HTMLSelectElement>('sub').addEventListener('change', (e) => {
    config.subdivision = (e.target as HTMLSelectElement).value as MetronomeConfig['subdivision'];
    save();
  });
  $<HTMLSelectElement>('sound').addEventListener('change', (e) => {
    config.sound = (e.target as HTMLSelectElement).value as MetronomeConfig['sound'];
    save();
    // hear the new sound at once
    if (ctx && !sched.isRunning)
      playClick(
        ctx,
        { time: ctx.currentTime + 0.02, gain: 1, accent: true, beat: 0, sub: 0, bar: 0 },
        config.sound,
        config.volume,
      );
  });
  $<HTMLInputElement>('volume').addEventListener('input', (e) => {
    config.volume = Number((e.target as HTMLInputElement).value);
    save();
  });
  const readTrainer = () => {
    const num = (id: string, d: number) => {
      const v = Number($<HTMLInputElement>(id).value);
      return Number.isFinite(v) ? Math.round(v) : d;
    };
    config.trainer = {
      on: $<HTMLInputElement>('trainer-on').checked,
      step: num('trainer-step', config.trainer.step) || config.trainer.step,
      bars: Math.min(32, Math.max(1, num('trainer-bars', config.trainer.bars))),
      target: clampBpm(num('trainer-target', config.trainer.target)),
    };
    save();
    sched.retune();
    showOptions();
  };
  for (const id of ['trainer-on', 'trainer-step', 'trainer-bars', 'trainer-target'])
    $(id).addEventListener('change', readTrainer);

  $('preset-save').addEventListener('click', () => {
    store.savePreset($<HTMLInputElement>('preset-name').value, structuredClone(config));
    $<HTMLInputElement>('preset-name').value = '';
    showPresets();
  });

  // ------------------------------------------------------------ running

  const keepAwake = async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
      };
      wake = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      // not allowed or not supported: the screen may dim, which is harmless
    }
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (!ctx || !sched.isRunning) return;
    // light the beat that is sounding now (allowing for the speaker's own delay)
    const now = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    while (seen.length && seen[0]!.time <= now) {
      const c = seen.shift()!;
      if (c.sub === 0 && c.beat !== lit) {
        lit = c.beat;
        for (const b of root.querySelectorAll<HTMLElement>('.metro-beat'))
          b.classList.toggle('now', b.dataset['beat'] === String(c.beat));
      }
    }
    const bpm = sched.currentBpm;
    if (bpm !== config.bpm && config.trainer.on) {
      // the trainer has moved the tempo on: show it without changing what is saved
      bpmInput.value = String(bpm);
      slider.value = String(bpm);
      $('name').textContent = tempoName(bpm);
    }
  };

  /** True while the audio context is being woken, so a second tap cannot start a second timer. */
  let starting = false;
  const start = async () => {
    if (starting || sched.isRunning) return;
    starting = true;
    ctx ??= new AudioContext();
    try {
      await ctx.resume();
    } finally {
      starting = false;
    }
    if (disposed || sched.isRunning) return;
    seen = [];
    lit = -1;
    sched.start(ctx.currentTime + LEAD_S);
    sched.advance(ctx.currentTime);
    timer = setInterval(() => ctx && sched.advance(ctx.currentTime), TIMER_MS);
    toggle.textContent = 'Stop';
    toggle.setAttribute('aria-pressed', 'true');
    $('status').textContent = '';
    void keepAwake();
  };
  const stop = () => {
    sched.stop();
    clearInterval(timer);
    timer = undefined;
    seen = [];
    lit = -1;
    for (const b of root.querySelectorAll<HTMLElement>('.metro-beat')) b.classList.remove('now');
    showTempo();
    toggle.textContent = 'Start';
    toggle.setAttribute('aria-pressed', 'false');
    void wake?.release();
    wake = null;
  };
  toggle.addEventListener('click', () => {
    if (sched.isRunning) stop();
    else
      void start().catch((err: unknown) => {
        $('status').textContent =
          `Could not start the sound: ${err instanceof Error ? err.message : String(err)}`;
      });
  });

  // space starts and stops, arrows change the tempo (when not typing in a field)
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (
      t &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) &&
      (t as HTMLInputElement).type !== 'range'
    )
      return;
    if (e.code === 'Space' && t?.tagName !== 'BUTTON') {
      e.preventDefault();
      toggle.click();
    } else if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
      if (t?.tagName === 'INPUT') return; // the slider handles its own arrows
      setBpm(config.bpm + (e.shiftKey ? 5 : 1));
    } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
      if (t?.tagName === 'INPUT') return;
      setBpm(config.bpm - (e.shiftKey ? 5 : 1));
    }
  };
  window.addEventListener('keydown', onKey);
  // the screen asks again for a wake lock when the page comes back (the browser drops it when hidden)
  const onVisible = () => {
    if (document.visibilityState === 'visible' && sched.isRunning) void keepAwake();
  };
  document.addEventListener('visibilitychange', onVisible);

  showAll();
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    stop();
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisible);
    if (ctx) void ctx.close();
  };
};
