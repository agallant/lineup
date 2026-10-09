import {
  ContinuousJudge,
  DiscreteJudge,
  Scoreboard,
  SongClock,
  continuousConfigFromProfile,
  discreteConfigFromProfile,
  type PitchFrame,
  type Chart,
  type InputEvent,
  type InstrumentProfile,
  type Judge,
  type Judgment,
  type ScoreConfig,
  type ScoreState,
  type TimeSource,
} from '@lineup/core';
import {
  InputAnalyzer,
  OnsetPitchAttacher,
  analyzerOptionsFromProfile,
  toPitchFrame,
  type AnalyzerMessage,
} from '@lineup/input';
import type { RenderedPerformance } from './performance';

/** A manually advanced clock standing in for AudioContext.currentTime. */
class ManualTime implements TimeSource {
  currentTime = 0;
}

export interface PipelineConfig<I> {
  performance: RenderedPerformance;
  profile: InstrumentProfile;
  judge: Judge<I>;
  /** Turns an analyzer message (AudioContext time) into judge inputs (song time). */
  adapt: (message: AnalyzerMessage, clock: SongClock) => I[];
  /** Called once at the end for inputs still held back (e.g. pitch-attachment waits). */
  flush?: (clock: SongClock) => I[];
  /** Samples per AudioWorklet render quantum. */
  blockSize?: number;
  /** How often the simulated game loop calls advance(), seconds (a 60 fps rAF by default). */
  frameInterval?: number;
  /**
   * Delay between the worklet producing a message and the main thread (the
   * game loop) receiving it, seconds. Real postMessage hops are a few ms to a
   * frame or two; judges must not expire notes while input is still in flight.
   */
  deliveryDelay?: number;
  scoring?: Partial<ScoreConfig>;
}

export interface PipelineResult<I> {
  judgments: readonly Judgment[];
  score: ScoreState;
  /** Everything the judge was fed, in song time. */
  inputs: I[];
  /** Every analyzer message, for debugging detectors. */
  messages: AnalyzerMessage[];
}

/**
 * Runs rendered audio through the same chain the game uses:
 * AudioWorklet-sized blocks -> InputAnalyzer -> adapter -> judge -> scoreboard,
 * with the song clock derived from a (simulated) AudioContext time and the
 * judge advanced on a fixed "frame" cadence.
 */
export function runPipeline<I>(config: PipelineConfig<I>): PipelineResult<I> {
  const { performance, profile, judge, adapt, flush } = config;
  const { signal, sampleRate, ctxStart, songStart } = performance;
  const blockSize = config.blockSize ?? 128;
  const frameInterval = config.frameInterval ?? 1 / 60;
  const deliveryDelay = config.deliveryDelay ?? 0;

  const time = new ManualTime();
  const clock = new SongClock(time);
  time.currentTime = ctxStart;
  clock.start(songStart);

  const analyzer = new InputAnalyzer(sampleRate, analyzerOptionsFromProfile(profile));
  const board = new Scoreboard(config.scoring);
  const inputs: I[] = [];
  const messages: AnalyzerMessage[] = [];
  const startFrame = Math.round(ctxStart * sampleRate);
  let nextFrameAt = ctxStart + frameInterval;
  /** Messages in flight from the worklet to the main thread, oldest first. */
  const inFlight: { deliverAt: number; message: AnalyzerMessage }[] = [];

  const deliver = (message: AnalyzerMessage) => {
    for (const input of adapt(message, clock)) {
      inputs.push(input);
      judge.feed(input);
    }
  };

  const settle = (judgments: Judgment[]) => judgments.forEach((j) => board.add(j));

  for (let n = 0; n < signal.length; n += blockSize) {
    const block = signal.subarray(n, Math.min(n + blockSize, signal.length));
    const blockEnd = ctxStart + (n + block.length) / sampleRate;
    for (const message of analyzer.process(block, startFrame + n)) {
      messages.push(message);
      inFlight.push({ deliverAt: blockEnd + deliveryDelay, message });
    }
    time.currentTime = blockEnd;
    while (inFlight.length && inFlight[0]!.deliverAt <= time.currentTime)
      deliver(inFlight.shift()!.message);
    while (time.currentTime >= nextFrameAt) {
      settle(judge.advance(clock.now()));
      nextFrameAt += frameInterval;
    }
  }
  for (const { message } of inFlight.splice(0)) deliver(message);
  for (const input of flush?.(clock) ?? []) {
    inputs.push(input);
    judge.feed(input);
  }
  settle(judge.advance(clock.now()));
  settle(judge.finish());
  return { judgments: judge.judgments, score: board.state, inputs, messages };
}

export interface DiscreteRunOptions {
  /** Calibrated latency offset handed to the judge, seconds. */
  latencyOffset: number;
  blockSize?: number;
  frameInterval?: number;
  deliveryDelay?: number;
}

export interface DiscreteRunResult extends PipelineResult<InputEvent> {
  strays: number;
}

/**
 * The discrete (onset-timing) game: ukulele strum, ukulele notes, and later
 * percussion. Pitch-matched profiles get the onset->pitch attacher in front of
 * the judge, exactly like the real app.
 */
export function runDiscrete(
  performance: RenderedPerformance,
  chart: Chart,
  profile: InstrumentProfile,
  { latencyOffset, blockSize, frameInterval, deliveryDelay }: DiscreteRunOptions,
): DiscreteRunResult {
  const judge = new DiscreteJudge(chart.notes, discreteConfigFromProfile(profile, latencyOffset));
  const attacher = profile.judgment.match.pitch ? new OnsetPitchAttacher() : null;
  const toSongTime = (e: InputEvent, clock: SongClock): InputEvent => ({
    ...e,
    time: clock.toSongTime(e.time),
  });

  const result = runPipeline<InputEvent>({
    performance,
    profile,
    judge,
    adapt: (message, clock) => {
      if (attacher) return attacher.push(message).map((e) => toSongTime(e, clock));
      return message.type === 'input' ? [toSongTime(message.event, clock)] : [];
    },
    flush: (clock) => (attacher ? attacher.flush().map((e) => toSongTime(e, clock)) : []),
    ...(blockSize !== undefined ? { blockSize } : {}),
    ...(frameInterval !== undefined ? { frameInterval } : {}),
    ...(deliveryDelay !== undefined ? { deliveryDelay } : {}),
  });
  return { ...result, strays: judge.strays };
}

export interface ContinuousRunResult extends PipelineResult<PitchFrame> {
  judge: ContinuousJudge;
}

/** The continuous (sustained pitch) game: voice, later winds. Pitch frames go straight to the judge. */
export function runContinuous(
  performance: RenderedPerformance,
  chart: Chart,
  profile: InstrumentProfile,
  { latencyOffset, blockSize, frameInterval, deliveryDelay }: DiscreteRunOptions,
): ContinuousRunResult {
  const hop = profile.detector.hopSize / performance.sampleRate;
  const judge = new ContinuousJudge(
    chart.notes,
    continuousConfigFromProfile(profile, latencyOffset, hop),
  );
  const result = runPipeline<PitchFrame>({
    performance,
    profile,
    judge,
    adapt: (message, clock) =>
      message.type === 'frame'
        ? [{ ...toPitchFrame(message.frame), time: clock.toSongTime(message.frame.time) }]
        : [],
    ...(blockSize !== undefined ? { blockSize } : {}),
    ...(frameInterval !== undefined ? { frameInterval } : {}),
    ...(deliveryDelay !== undefined ? { deliveryDelay } : {}),
  });
  return { ...result, judge };
}
