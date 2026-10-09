/** Schedules short click bursts on an AudioContext at the given context times. Returns a stop function. */
export function scheduleClicks(
  ctx: AudioContext,
  times: readonly number[],
  { gain = 0.4, hz = 1000 }: { gain?: number; hz?: number } = {},
): () => void {
  const nodes: OscillatorNode[] = [];
  for (const at of times) {
    if (at < ctx.currentTime - 0.02) continue;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = hz;
    osc.connect(g).connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.start(at);
    osc.stop(at + 0.06);
    nodes.push(osc);
  }
  return () => {
    for (const o of nodes) {
      try {
        o.stop();
      } catch {
        // already stopped
      }
    }
  };
}

/** A steady sine tone for `seconds` starting now. Resolves when it has finished. */
export function playTone(
  ctx: AudioContext,
  hz: number,
  seconds: number,
  gain = 0.25,
): Promise<void> {
  return new Promise((resolve) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = hz;
    osc.connect(g).connect(ctx.destination);
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.03);
    g.gain.setValueAtTime(gain, t0 + seconds - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t0 + seconds);
    osc.onended = () => resolve();
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
