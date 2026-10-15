/**
 * Recorded notes, where we have licensed ones: a few samples of an upright piano (VSCO 2 Community
 * Edition, CC0; see THIRD_PARTY_NOTICES.md), loaded in the background the first time a piano is
 * wanted and stretched to the pitch asked. Until they have arrived (or where they cannot load at all)
 * the synthesized piano in `voices.ts` sounds instead, so nothing ever waits on a download.
 */

/** A recorded note: its pitch and the file. */
interface PianoSample {
  readonly midi: number;
  readonly file: string;
}

/** The notes recorded, as played (a real piano is tuned a little flat in the bass, and left so). */
export const PIANO_SAMPLES: readonly PianoSample[] = [
  { midi: 36, file: 'C2' },
  { midi: 43, file: 'G2' },
  { midi: 48, file: 'C3' },
  { midi: 55, file: 'G3' },
  { midi: 60, file: 'C4' },
  { midi: 67, file: 'G4' },
  { midi: 72, file: 'C5' },
  { midi: 79, file: 'G5' },
  { midi: 84, file: 'C6' },
  { midi: 91, file: 'G6' },
];

/** A decoded sample and the loudest point in it, to even out the loudness between them. */
export interface LoadedSample {
  readonly buffer: AudioBuffer;
  readonly peak: number;
  readonly midi: number;
}

/** What loading needs from a context. */
type DecodeContext = Pick<BaseAudioContext, 'decodeAudioData'>;

const banks = new WeakMap<object, Map<number, LoadedSample>>();
const started = new WeakSet<object>();

/** The folder the samples are served from, relative to the page. */
const folder = (): string => `${import.meta.env.BASE_URL ?? './'}samples/piano/`;

/** Every file the piano needs, for the service worker to keep for offline use. */
export const pianoSampleUrls = (): string[] =>
  PIANO_SAMPLES.map((s) => new URL(`${folder()}${s.file}.mp3`, location.href).href);

/** The loudest sample value in a buffer. */
function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  }
  return peak;
}

/**
 * Starts loading the piano samples for a context, once. Failures are ignored: the synthesized piano
 * keeps sounding. Safe to call as often as wanted.
 */
export function loadPianoSamples(ctx: DecodeContext & object): void {
  if (started.has(ctx) || typeof fetch !== 'function') return;
  started.add(ctx);
  const bank = new Map<number, LoadedSample>();
  banks.set(ctx, bank);
  for (const s of PIANO_SAMPLES) {
    void fetch(`${folder()}${s.file}.mp3`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        const peak = peakOf(buffer);
        if (peak > 0) bank.set(s.midi, { buffer, peak, midi: s.midi });
      })
      .catch(() => undefined);
  }
}

/** The loaded sample nearest to a note, if any have arrived. */
export function nearestPianoSample(ctx: object, midi: number): LoadedSample | undefined {
  const bank = banks.get(ctx);
  if (!bank || bank.size === 0) return undefined;
  let best: LoadedSample | undefined;
  for (const s of bank.values()) {
    if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
  }
  return best;
}
