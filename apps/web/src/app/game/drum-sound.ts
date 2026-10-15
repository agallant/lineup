/** The drums a backing can sound. */
export type DrumVoice = 'kick' | 'snare' | 'rim' | 'hat' | 'openhat' | 'tomlow' | 'tomhigh';

/** What `playDrum` needs of a context (a real `AudioContext`, or an offline one). */
export type DrumContext = Pick<
  BaseAudioContext,
  | 'createGain'
  | 'createOscillator'
  | 'createBuffer'
  | 'createBufferSource'
  | 'createBiquadFilter'
  | 'destination'
  | 'sampleRate'
>;

/** A second of white noise, made once per context and shared by the snare, rim and hats. */
const noiseBuffers = new WeakMap<object, AudioBuffer>();
function noise(ctx: DrumContext): AudioBuffer {
  let b = noiseBuffers.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = b.getChannelData(0);
    // a fixed seed, so every hit of a kind sounds the same
    let x = 54321;
    for (let i = 0; i < d.length; i++) {
      x = (x * 1664525 + 1013904223) >>> 0;
      d[i] = x / 2 ** 31 - 1;
    }
    noiseBuffers.set(ctx, b);
  }
  return b;
}

/** Whether a context can synthesize the drums (a bare fake with only oscillators cannot). */
export function canPlayDrums(ctx: object): ctx is DrumContext {
  const c = ctx as Partial<DrumContext>;
  return (
    typeof c.createBuffer === 'function' &&
    typeof c.createBufferSource === 'function' &&
    typeof c.createBiquadFilter === 'function' &&
    typeof c.sampleRate === 'number' &&
    Number.isFinite(c.sampleRate) &&
    c.sampleRate > 0
  );
}

/**
 * Sounds one drum hit at `at` (seconds on the audio clock) at `level` (1 is a normal kick; the
 * backing's relative loudness). A kick and the toms are a sine that falls fast in pitch; the snare is
 * noise over a short body; the hats are high-passed noise, tight or open; the rim is a short click.
 * Everything is enveloped, so none leaves a click of its own. Returns the sources, so a stop can cancel them.
 */
export function playDrum(
  ctx: DrumContext,
  voice: DrumVoice,
  at: number,
  level: number,
): AudioScheduledSourceNode[] {
  const sources: AudioScheduledSourceNode[] = [];
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const peak = Math.min(1, 0.32 * level);
  const sweep = (from: number, to: number, decay: number, amp: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + decay * 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak * amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + decay + 0.02);
    osc.onended = () => out.disconnect();
    sources.push(osc);
  };
  const burst = (type: BiquadFilterType, hz: number, q: number, decay: number, amp: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak * amp, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    src.connect(filter).connect(g).connect(out);
    src.start(at);
    src.stop(at + decay + 0.02);
    src.onended = () => out.disconnect();
    sources.push(src);
  };
  switch (voice) {
    case 'kick':
      sweep(150, 42, 0.28, 1.6);
      break;
    case 'tomlow':
      sweep(130, 80, 0.3, 1.1);
      break;
    case 'tomhigh':
      sweep(190, 120, 0.25, 1.1);
      break;
    case 'snare':
      sweep(200, 150, 0.12, 0.7);
      burst('highpass', 1800, 0.7, 0.16, 1.1);
      break;
    case 'rim':
      sweep(420, 330, 0.04, 0.6);
      burst('bandpass', 2400, 1.5, 0.04, 0.9);
      break;
    case 'hat':
      burst('highpass', 7000, 0.7, 0.05, 1.4);
      break;
    case 'openhat':
      burst('highpass', 6000, 0.7, 0.25, 1.2);
      break;
  }
  return sources;
}
