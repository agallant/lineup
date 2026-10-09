// Runs on the audio rendering thread. Kept thin: all analysis lives in
// InputAnalyzer so it can be unit tested without a browser.
import { InputAnalyzer } from '../dsp/analyzer';
import {
  INPUT_PROCESSOR_NAME,
  type ChannelSelection,
  type InputProcessorOptions,
  type ProcessorCommand,
} from './protocol';

// Minimal AudioWorkletGlobalScope typings (TypeScript ships none).
declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(
  name: string,
  ctor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessorBase,
): void;
declare class AudioWorkletProcessorBase {
  readonly port: MessagePort;
}
declare const AudioWorkletProcessor: typeof AudioWorkletProcessorBase;

class InputProcessor extends AudioWorkletProcessor {
  private readonly analyzer = new InputAnalyzer(sampleRate);
  private channel: ChannelSelection = 0;
  private mixBuffer = new Float32Array(128);

  constructor(options: AudioWorkletNodeOptions) {
    super();
    const initial = (options.processorOptions as InputProcessorOptions | undefined)?.channel;
    if (initial !== undefined) this.channel = initial;
    this.port.onmessage = (e: MessageEvent<ProcessorCommand>) => {
      if (e.data.type === 'channel') this.channel = e.data.value;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const block = this.select(channels);
    for (const message of this.analyzer.process(block, currentFrame)) {
      this.port.postMessage(message);
    }
    return true;
  }

  private select(channels: Float32Array[]): Float32Array {
    if (this.channel !== 'mix') return channels[this.channel] ?? channels[0]!;
    const n = channels[0]!.length;
    if (this.mixBuffer.length !== n) this.mixBuffer = new Float32Array(n);
    const mix = this.mixBuffer;
    mix.fill(0);
    for (const ch of channels) for (let i = 0; i < n; i++) mix[i]! += ch[i]! / channels.length;
    return mix;
  }
}

registerProcessor(INPUT_PROCESSOR_NAME, InputProcessor);
