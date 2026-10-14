import type { Click, ClickSound } from './metronome';

/** A second of white noise, made once per context and reused for the percussive sounds. */
const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();
function noise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    // a fixed seed, so every click of a kind sounds the same
    let x = 12345;
    for (let i = 0; i < d.length; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      d[i] = x / 2 ** 31 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** The pitch of each sound, Hz: [normal, accent]. */
const PITCH: Record<ClickSound, readonly [number, number]> = {
  click: [1500, 2400],
  wood: [880, 1320],
  beep: [880, 1320],
  hat: [7000, 9000],
};

/**
 * Sounds one click at `click.time` on the audio clock, with the master `volume`. Each sound is a short
 * enveloped burst, so it never leaves a click of its own at the start or end.
 */
export function playClick(
  ctx: AudioContext,
  click: Click,
  sound: ClickSound,
  volume: number,
): void {
  const t = click.time;
  const level = Math.min(1, click.gain * volume);
  if (level <= 0) return;
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const [normal, accent] = PITCH[sound];
  const hz = click.accent ? accent : normal;
  const stop = (...nodes: AudioScheduledSourceNode[]) => {
    for (const n of nodes) n.onended = () => out.disconnect();
  };
  if (sound === 'hat' || sound === 'click') {
    // filtered noise for the hat, and a short bright tick for the click
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = sound === 'hat' ? 1.2 : 4;
    const dur = sound === 'hat' ? (click.accent ? 0.09 : 0.05) : 0.03;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level * (sound === 'hat' ? 0.9 : 1.4), t + 0.002);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(out);
    src.start(t);
    src.stop(t + dur + 0.01);
    stop(src);
    return;
  }
  // wood block and beep: a pitched sine with a fast decay (the wood a little shorter)
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = hz;
  const dur = sound === 'wood' ? 0.05 : 0.08;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(level * 0.9, t + 0.003);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.01);
  stop(osc);
}
