import workletUrl from './worklet/input-processor.ts?worker&url';
import { audioConstraints } from './constraints';
import type { AnalyzerMessage } from './types';
import {
  INPUT_PROCESSOR_NAME,
  type ChannelSelection,
  type InputProcessorOptions,
  type ProcessorCommand,
} from './worklet/protocol';

export interface MicSession {
  readonly ctx: AudioContext;
  readonly stream: MediaStream;
  readonly track: MediaStreamTrack;
  /** For visualisation only (waveform). Analysis happens in the worklet. */
  readonly analyser: AnalyserNode;
  /** Receives every message the worklet posts. */
  onMessage: (message: AnalyzerMessage) => void;
  setChannel(channel: ChannelSelection): void;
  close(): Promise<void>;
}

export function micSupported(): boolean {
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined'
  );
}

/**
 * Opens the mic with voice processing disabled and starts the input worklet.
 * Call from a user gesture (button tap).
 *
 * Order matters on iOS: we open the mic first and create the AudioContext
 * second, so the context starts while capture is active (WebKit allows that
 * without a separate gesture) and picks up the hardware sample rate.
 */
export async function openMic(
  deviceId?: string,
  channel: ChannelSelection = 0,
): Promise<MicSession> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
  const track = stream.getAudioTracks()[0];
  if (!track) throw new Error('No audio track in the mic stream');

  const ctx = new AudioContext({ latencyHint: 'interactive' });
  try {
    await ctx.audioWorklet.addModule(workletUrl);
    const source = ctx.createMediaStreamSource(stream);

    const processorOptions: InputProcessorOptions = { channel };
    const node = new AudioWorkletNode(ctx, INPUT_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCountMode: 'max',
      processorOptions,
    });
    // The worklet writes nothing; routing it to the destination through a
    // muted gain just guarantees every browser keeps pulling it.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node).connect(mute).connect(ctx.destination);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    const session: MicSession = {
      ctx,
      stream,
      track,
      analyser,
      onMessage: () => undefined,
      setChannel(value) {
        const cmd: ProcessorCommand = { type: 'channel', value };
        node.port.postMessage(cmd);
      },
      async close() {
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        for (const t of stream.getTracks()) t.stop();
        if (ctx.state !== 'closed') await ctx.close();
      },
    };
    node.port.onmessage = (e: MessageEvent<AnalyzerMessage>) => session.onMessage(e.data);

    await ctx.resume().catch(() => undefined);
    return session;
  } catch (err) {
    for (const t of stream.getTracks()) t.stop();
    void ctx.close();
    throw err;
  }
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}
