import {
  EnrollmentSession,
  chartFromBeats,
  type EnrollOutcome,
  type EnrollmentOptions,
  type InstrumentProfile,
  type TimbreModel,
} from '@lineup/core';
import { InputAnalyzer, analyzerOptionsFromProfile } from '@lineup/input';
import { renderPerformance, type PerformanceOptions } from './performance';
import { percussionPerformer, type HitSound, type PercussionPerformerOptions } from './performers';

export interface SyntheticEnrollment {
  model: TimbreModel;
  warnings: string[];
  /** What happened to each onset the detector reported, in order. */
  outcomes: EnrollOutcome[];
}

/**
 * Plays the profile's enrollment prompts (class by class, `perClass` hits
 * each, a beat apart) through the real analyzer and trains the model, like a
 * person following the enrollment screen.
 */
export function enrollSynthetic(
  profile: InstrumentProfile,
  sounds: Readonly<Record<string, HitSound>>,
  {
    perClass = 6,
    performer,
    performance,
    enrollment,
  }: {
    perClass?: number;
    performer?: PercussionPerformerOptions;
    performance?: PerformanceOptions;
    enrollment?: Partial<EnrollmentOptions>;
  } = {},
): SyntheticEnrollment {
  const classes = profile.timbreClasses;
  if (!classes?.length) throw new Error(`profile "${profile.id}" has no timbre classes`);
  const session = new EnrollmentSession(classes, { perClass, ...enrollment });
  const outcomes: EnrollOutcome[] = [];
  classes.forEach((cls, k) => {
    const lane = profile.lanes?.find((l) => l.timbre === cls.id)?.id;
    if (!lane) throw new Error(`profile "${profile.id}" has no lane for timbre "${cls.id}"`);
    // extra hits beyond perClass are ignored once the class is complete, so give a few spare
    const chart = chartFromBeats(
      { title: 'enroll', bpm: 100, countInBeats: 1 },
      Array.from({ length: perClass + 2 }, (_, i) => ({ beat: i, lane })),
    );
    const perf = renderPerformance(chart, percussionPerformer(sounds, performer), {
      seed: 11,
      // one continuous audio clock across classes, like a real session
      ctxStart: k * 30,
      ...performance,
    });
    const analyzer = new InputAnalyzer(perf.sampleRate, analyzerOptionsFromProfile(profile));
    const start = Math.round(perf.ctxStart * perf.sampleRate);
    for (let n = 0; n < perf.signal.length; n += 128) {
      for (const m of analyzer.process(perf.signal.subarray(n, n + 128), start + n)) {
        if (m.type !== 'input' || session.current?.id !== cls.id) continue;
        outcomes.push(session.add(m.event));
      }
    }
  });
  return { ...session.build(), outcomes };
}
