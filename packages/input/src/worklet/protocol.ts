// Shared between the main thread and the input worklet. Must not import
// anything that touches worklet-only globals.
import type { InputAnalyzerOptions } from '../dsp/analyzer';

export const INPUT_PROCESSOR_NAME = 'lineup-input';

/** Which input channel to analyze. 'mix' averages all channels. */
export type ChannelSelection = number | 'mix';

export interface InputProcessorOptions {
  channel?: ChannelSelection;
  /** Detector settings (from the instrument profile). Plain data, so it survives structured clone. */
  analyzer?: InputAnalyzerOptions;
}

/** Messages from the main thread to the worklet. */
export type ProcessorCommand = { type: 'channel'; value: ChannelSelection };
