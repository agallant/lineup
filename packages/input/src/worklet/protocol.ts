// Shared between the main thread and the input worklet. Must not import
// anything that touches worklet-only globals.

export const INPUT_PROCESSOR_NAME = 'lineup-input';

/** Which input channel to analyze. 'mix' averages all channels. */
export type ChannelSelection = number | 'mix';

export interface InputProcessorOptions {
  channel?: ChannelSelection;
}

/** Messages from the main thread to the worklet. */
export type ProcessorCommand = { type: 'channel'; value: ChannelSelection };
