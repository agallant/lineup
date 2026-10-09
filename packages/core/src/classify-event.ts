import type { InstrumentProfile } from './profile';
import { classify, laneForClass, type Classification, type TimbreModel } from './timbre';
import type { InputEvent } from './types';

export interface ClassifiedEvent {
  event: InputEvent;
  /** Null when the event had no usable features. */
  classification: Classification | null;
}

/**
 * Sets `event.lane` from the enrolled model. A hit the model rejects as
 * "unknown" gets no lane (a strict-lane judge then won't count it). Without a
 * model events pass through untouched, which is what the single-lane any-hit
 * profile wants.
 */
export function classifyEvent(
  profile: InstrumentProfile,
  model: TimbreModel | null,
  event: InputEvent,
): ClassifiedEvent {
  if (!model || profile.input !== 'percussion') return { event, classification: null };
  const classification = classify(model, event.features);
  if (!classification) return { event, classification: null };
  const lane = laneForClass(profile.lanes, classification.id);
  const classified: InputEvent = { ...event };
  if (lane === undefined) delete classified.lane;
  else classified.lane = lane;
  return { event: classified, classification };
}
