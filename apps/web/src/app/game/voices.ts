import { canPlayDrums, noise, type DrumContext } from './drum-sound';
import { loadPianoSamples, nearestPianoSample } from './samples';

/**
 * Instrument voices, built from Web Audio nodes so no sample files are needed: a plucked string (steel
 * or nylon, from a Karplus-Strong model tuned exactly), a piano with inharmonic partials that die at
 * their own rates under a closing filter, a bass, an organ, a flute with breath and vibrato, a soft pad,
 * a mallet and a tanpura. Each voice sounds one note and can be released.
 */
export type Voice =
  'pluck' | 'nylon' | 'bass' | 'piano' | 'organ' | 'flute' | 'pad' | 'mallet' | 'tanpura';

export const VOICES: readonly Voice[] = [
  'pluck',
  'nylon',
  'bass',
  'piano',
  'organ',
  'flute',
  'pad',
  'mallet',
  'tanpura',
];

/** What a voice needs of a context (a real one, or an offline one). */
export type VoiceContext = DrumContext & Pick<BaseAudioContext, 'currentTime'>;

/** Whether the context can sound voices (a bare test fake with only oscillators cannot). */
export const canPlayVoices = (ctx: object): boolean =>
  canPlayDrums(ctx) && typeof (ctx as Partial<VoiceContext>).currentTime === 'number';

/** A sounding note, which can be let go. */
export interface VoiceNote {
  /** Lets the note die away from `at` (seconds on the audio clock). */
  release(at: number): void;
  /** Everything started for it, so it can be cut off at once. */
  readonly sources: readonly AudioScheduledSourceNode[];
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** How loud level 1 is: the peak of a single note, as the backing has always balanced its tones. */
const BASE = 0.16;

/** Karplus-Strong string buffers, per context and note (made once, then reused). */
const strings = new WeakMap<object, Map<string, AudioBuffer>>();

type StringKind = 'steel' | 'nylon' | 'tanpura';

/**
 * A plucked string as a buffer: a burst of noise travelling round a delay line that averages
 * neighbouring samples, so the highs die first, as on a real string. The buffer is made at the rate
 * that puts its pitch exactly on `midi`, and playing it at the context's rate keeps that pitch.
 */
function stringBuffer(ctx: VoiceContext, midi: number, kind: StringKind): AudioBuffer {
  let byNote = strings.get(ctx);
  if (!byNote) strings.set(ctx, (byNote = new Map()));
  const key = `${kind}:${midi}`;
  const cached = byNote.get(key);
  if (cached) return cached;
  const f = hz(midi);
  // each pass replaces a sample with the average of itself and the next, so the loop is n - 1/2 long
  const n = Math.max(3, Math.round(ctx.sampleRate / f + 0.5));
  const rate = f * (n - 0.5);
  const seconds = kind === 'tanpura' ? 5 : kind === 'nylon' ? 2.4 : 2.8;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const out = buf.getChannelData(0);
  // a fixed seed per note, so a note always sounds the same
  let seed = (1234567 + midi * 977 + (kind === 'nylon' ? 31 : kind === 'tanpura' ? 59 : 0)) >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 31 - 1;
  };
  const line = new Float32Array(n);
  for (let i = 0; i < n; i++) line[i] = rnd();
  // the pluck: smooth the burst (a nylon string, a soft finger) and take out the harmonic at the
  // plucking point, a fraction of the way along the string
  const smooth = kind === 'nylon' ? 3 : kind === 'steel' ? 1 : 0;
  for (let pass = 0; pass < smooth; pass++) {
    for (let i = n - 1; i > 0; i--) line[i] = 0.5 * (line[i]! + line[i - 1]!);
  }
  const pick = Math.max(1, Math.round(n * (kind === 'nylon' ? 0.2 : 0.13)));
  const comb = Float32Array.from(line);
  for (let i = 0; i < n; i++) line[i] = comb[i]! - 0.7 * comb[(i + n - pick) % n]!;
  // how long it rings: a minus 60 dB decay in this many seconds, a low string longer than a high one
  const ring =
    (kind === 'tanpura' ? 8 : kind === 'nylon' ? 2.6 : 3.2) * Math.min(2.2, Math.max(0.7, 196 / f));
  const damp = 10 ** (-3 / (ring * f));
  for (let i = 0; i < len; i++) {
    const at = i % n;
    const here = line[at]!;
    out[i] = here;
    line[at] = damp * 0.5 * (here + line[(at + 1) % n]!);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const norm = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < len; i++) out[i] = out[i]! * norm;
  byNote.set(key, buf);
  return buf;
}

/** The pieces a voice builds on: a note envelope into the output, and a way to release. */
interface Rig {
  ctx: VoiceContext;
  env: GainNode;
  sources: AudioScheduledSourceNode[];
  /** How long the note takes to die once released, as a time constant. */
  tau: number;
}

function rig(ctx: VoiceContext, at: number, tau: number): Rig {
  const env = ctx.createGain();
  env.gain.setValueAtTime(1, at);
  env.connect(ctx.destination);
  return { ctx, env, sources: [], tau };
}

function osc(r: Rig, type: OscillatorType, freq: number, at: number): OscillatorNode {
  const o = r.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(at);
  r.sources.push(o);
  return o;
}

/** An oscillator through its own gain, into `to`. The gain is returned for shaping. */
function partial(r: Rig, to: AudioNode, freq: number, at: number, amp: number): GainNode {
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(amp, at);
  osc(r, 'sine', freq, at).connect(g).connect(to);
  return g;
}

function finish(r: Rig): VoiceNote {
  return {
    sources: r.sources,
    release(when) {
      const t = Math.max(when, r.ctx.currentTime);
      r.env.gain.cancelScheduledValues(t);
      r.env.gain.setTargetAtTime(0, t, r.tau);
      const end = t + r.tau * 7 + 0.02;
      for (const s of r.sources) {
        try {
          s.stop(end);
        } catch {
          // already stopped
        }
      }
    },
  };
}

function plucked(ctx: VoiceContext, kind: StringKind, midi: number, at: number, level: number) {
  const r = rig(ctx, at, kind === 'tanpura' ? 0.5 : 0.045);
  const src = ctx.createBufferSource();
  src.buffer = stringBuffer(ctx, midi, kind);
  const g = ctx.createGain();
  g.gain.value = BASE * level * 1.4;
  src.connect(g).connect(r.env);
  src.start(at);
  r.sources.push(src);
  return finish(r);
}

/** A recorded piano note, stretched to the pitch, once the samples have arrived. */
function sampledPiano(
  ctx: VoiceContext,
  midi: number,
  at: number,
  level: number,
): VoiceNote | null {
  const s = nearestPianoSample(ctx, midi);
  if (!s) return null;
  const r = rig(ctx, at, midi < 60 ? 0.18 : 0.1);
  const src = ctx.createBufferSource();
  src.buffer = s.buffer;
  src.playbackRate.value = 2 ** ((midi - s.midi) / 12);
  const g = ctx.createGain();
  // every sample is brought to the loudness of the synthesized piano
  g.gain.value = (0.19 * level) / s.peak;
  src.connect(g).connect(r.env);
  src.start(at);
  r.sources.push(src);
  return finish(r);
}

function piano(ctx: VoiceContext, midi: number, at: number, level: number) {
  loadPianoSamples(ctx as unknown as BaseAudioContext);
  const recorded = sampledPiano(ctx, midi, at, level);
  if (recorded) return recorded;
  const r = rig(ctx, at, midi < 60 ? 0.18 : 0.1);
  const f0 = hz(midi);
  // a bright note sings longer in the low register; the strings stiffen the upper partials sharp
  const ring = Math.min(7, Math.max(0.7, 6 * 2 ** (-(midi - 40) / 18)));
  const stiff = 0.00012 * 2 ** ((midi - 60) / 14);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.5;
  // the hammer's brightness fades as the note decays; a harder strike starts brighter
  const open = Math.min(14000, f0 * 5 + 2500 * level + 1500);
  tone.frequency.setValueAtTime(open, at);
  tone.frequency.setTargetAtTime(Math.max(f0 * 2.2, 900), at, ring * 0.3);
  const bus = ctx.createGain();
  bus.gain.value = BASE * level * 1.0;
  tone.connect(bus).connect(r.env);
  const count = f0 > 1500 ? 3 : f0 > 700 ? 5 : 8;
  for (let k = 1; k <= count; k++) {
    const fk = f0 * k * Math.sqrt(1 + stiff * k * k);
    if (fk > 15000) break;
    // the hammer strikes a seventh of the way along the string, which thins out its 7th partial
    const amp = (1 / k ** 0.8) * (0.35 + Math.abs(Math.sin((Math.PI * k) / 7.5)));
    const g = partial(r, tone, fk, at, amp * 0.55);
    // a unison of strings is a little apart, which gives the slow beating of a real piano
    g.gain.setTargetAtTime(0.0001, at + 0.004, ring / (1 + 0.9 * (k - 1)));
  }
  // the thump of the hammer
  const thump = ctx.createBufferSource();
  thump.buffer = noise(ctx);
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(4000, f0 * 3);
  band.Q.value = 0.8;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.0001, at);
  tg.gain.exponentialRampToValueAtTime(BASE * level * 0.25, at + 0.002);
  tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  thump.connect(band).connect(tg).connect(r.env);
  thump.start(at);
  thump.stop(at + 0.05);
  return finish(r);
}

function bass(ctx: VoiceContext, midi: number, at: number, level: number) {
  const r = rig(ctx, at, 0.06);
  const f0 = hz(midi);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 2;
  // a plucked bass: the filter opens on the pluck and closes as the note settles
  tone.frequency.setValueAtTime(Math.min(3200, f0 * 14), at);
  tone.frequency.setTargetAtTime(Math.max(f0 * 2.5, 180), at, 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(BASE * level * 0.62, at + 0.006);
  g.gain.setTargetAtTime(BASE * level * 0.42, at + 0.02, 0.5);
  osc(r, 'sawtooth', f0, at).connect(tone);
  // a sine on the fundamental gives the weight a saw alone lacks on a small speaker
  partial(r, tone, f0, at, 0.9);
  tone.connect(g).connect(r.env);
  return finish(r);
}

function organ(ctx: VoiceContext, midi: number, at: number, level: number) {
  const r = rig(ctx, at, 0.05);
  const f0 = hz(midi);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, at);
  bus.gain.linearRampToValueAtTime(BASE * level * 0.5, at + 0.012);
  bus.connect(r.env);
  // drawbars: the fundamental, the octave, the fifth above it and two octaves up
  [
    [1, 1],
    [2, 0.55],
    [3, 0.32],
    [4, 0.2],
  ].forEach(([mult, amp]) => partial(r, bus, f0 * mult!, at, amp!));
  return finish(r);
}

function flute(ctx: VoiceContext, midi: number, at: number, level: number) {
  const r = rig(ctx, at, 0.07);
  const f0 = hz(midi);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, at);
  bus.gain.linearRampToValueAtTime(BASE * level * 0.75, at + 0.07);
  bus.connect(r.env);
  const vibrato = osc(r, 'sine', 5.2, at);
  const depth = ctx.createGain();
  // the vibrato comes in after the note has begun, as a player lets it
  depth.gain.setValueAtTime(0, at);
  depth.gain.linearRampToValueAtTime(f0 * 0.0045, at + 0.5);
  vibrato.connect(depth);
  [
    [1, 1],
    [2, 0.28],
    [3, 0.09],
  ].forEach(([mult, amp]) => {
    const o = osc(r, 'sine', f0 * mult!, at);
    depth.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.value = amp!;
    o.connect(g).connect(bus);
  });
  // the breath
  const air = ctx.createBufferSource();
  air.buffer = noise(ctx);
  air.loop = true;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = Math.min(9000, f0 * 4);
  band.Q.value = 1.2;
  const ag = ctx.createGain();
  ag.gain.setValueAtTime(0.0001, at);
  ag.gain.linearRampToValueAtTime(0.05, at + 0.04);
  ag.gain.setTargetAtTime(0.018, at + 0.06, 0.1);
  air.connect(band).connect(ag).connect(bus);
  air.start(at);
  r.sources.push(air);
  return finish(r);
}

function pad(ctx: VoiceContext, midi: number, at: number, level: number) {
  const r = rig(ctx, at, 0.3);
  const f0 = hz(midi);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.Q.value = 0.4;
  tone.frequency.value = Math.min(5000, f0 * 3.5 + 500);
  const bus = ctx.createGain();
  bus.gain.setValueAtTime(0.0001, at);
  bus.gain.linearRampToValueAtTime(BASE * level * 0.36, at + 0.14);
  tone.connect(bus).connect(r.env);
  // two saws a few cents apart, softened: a warm swell rather than a buzz
  for (const cents of [-7, 7]) osc(r, 'sawtooth', f0 * 2 ** (cents / 1200), at).connect(tone);
  return finish(r);
}

function mallet(ctx: VoiceContext, midi: number, at: number, level: number) {
  const r = rig(ctx, at, 0.08);
  const f0 = hz(midi);
  const bus = ctx.createGain();
  bus.gain.value = BASE * level * 0.9;
  bus.connect(r.env);
  const body = partial(r, bus, f0, at, 1);
  body.gain.setTargetAtTime(0.0001, at + 0.002, 0.5);
  // a marimba's second mode sits two octaves and a bit up and is gone almost at once
  const ring = partial(r, bus, f0 * 3.97, at, 0.35);
  ring.gain.setTargetAtTime(0.0001, at + 0.002, 0.07);
  return finish(r);
}

/**
 * Starts a note of a voice at `at` (seconds on the audio clock) at `level` (1 is the normal loudness
 * of a backing note). It sounds until it is released or, for a plucked string, rings itself out.
 */
export function startVoice(
  ctx: VoiceContext,
  voice: Voice,
  midi: number,
  at: number,
  level = 1,
): VoiceNote {
  const t = Math.max(at, ctx.currentTime);
  // a note too high for a string model (or for a buffer) is a mallet, which is how it would sound
  const high = hz(midi) > 1400;
  switch (voice) {
    case 'pluck':
      return high ? mallet(ctx, midi, t, level) : plucked(ctx, 'steel', midi, t, level);
    case 'nylon':
      return high ? mallet(ctx, midi, t, level) : plucked(ctx, 'nylon', midi, t, level);
    case 'tanpura':
      return plucked(ctx, 'tanpura', midi, t, level);
    case 'bass':
      return bass(ctx, midi, t, level);
    case 'piano':
      return piano(ctx, midi, t, level);
    case 'organ':
      return organ(ctx, midi, t, level);
    case 'flute':
      return flute(ctx, midi, t, level);
    case 'pad':
      return pad(ctx, midi, t, level);
    case 'mallet':
      return mallet(ctx, midi, t, level);
  }
}

/** Plays a note for `duration` seconds from `at` and lets it go. Returns what it started. */
export function playVoice(
  ctx: VoiceContext,
  voice: Voice,
  midi: number,
  at: number,
  duration: number,
  level = 1,
): readonly AudioScheduledSourceNode[] {
  const note = startVoice(ctx, voice, midi, at, level);
  note.release(Math.max(at, ctx.currentTime) + Math.max(0.05, duration));
  return note.sources;
}
