/**
 * Percussion timbre classification: which of the player's sounds was that hit?
 *
 * Nearest-centroid on standardized features. The player enrolls a handful of
 * hits per class (clap, tap, ...); the model stores each class's mean and the
 * per-feature spread, and rejects hits that are far from every class ("unknown")
 * so a cough or a door slam does not become a note. With a single class the
 * model is an "any hit" detector and never rejects on timbre.
 */

/** Features used for classification, in model order. Level is deliberately excluded. */
export const TIMBRE_FEATURES = [
  'centroid',
  'low',
  'mid',
  'high',
  'decayMs',
  'zcr',
  'flatness',
] as const;
export type TimbreFeature = (typeof TIMBRE_FEATURES)[number];

/** Smallest spread per feature (in transformed units), so near-identical enrollments do not make the model brittle. */
const MIN_SCALE: readonly number[] = [0.22, 0.08, 0.08, 0.08, 0.35, 0.03, 0.08];

/** Hits whose raw features are missing or not finite cannot be classified. */
export function featureVector(
  features: Readonly<Record<string, number>> | undefined,
): number[] | null {
  if (!features) return null;
  const out: number[] = [];
  for (const name of TIMBRE_FEATURES) {
    const v = features[name];
    if (v === undefined || !Number.isFinite(v)) return null;
    // log scale for the two features that span decades
    out.push(
      name === 'centroid'
        ? Math.log(Math.max(v, 20))
        : name === 'decayMs'
          ? Math.log(Math.max(v, 0.5))
          : v,
    );
  }
  return out;
}

export interface TimbreClassModel {
  id: string;
  mean: number[];
  /** Number of enrollment hits behind the mean. */
  count: number;
  /** Largest standardized distance of an enrollment hit from the mean. */
  radius: number;
}

export interface TimbreModel {
  version: 1;
  classes: TimbreClassModel[];
  /** Per-feature standardization scale (same order as TIMBRE_FEATURES). */
  scale: number[];
}

export interface Classification {
  /** Best class, or null when the hit is too far from every class. */
  id: string | null;
  /** The nearest class regardless of rejection. */
  nearest: string;
  /** Standardized distance to the nearest class. */
  distance: number;
  /** Distance to the second-nearest minus the nearest (0 with one class). Small = ambiguous. */
  margin: number;
}

export interface TrainingSample {
  classId: string;
  features: Readonly<Record<string, number>>;
}

/** How far outside its enrolled radius a hit may fall before it is "unknown". */
export const REJECT_FACTOR = 2;
/** A class's radius never counts as less than this (standardized units), so tight enrollments stay usable. */
export const MIN_RADIUS = 2.2;

function distance(a: readonly number[], b: readonly number[], scale: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (a[i]! - b[i]!) / scale[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum / a.length);
}

export function trainTimbreModel(samples: readonly TrainingSample[]): TimbreModel {
  const byClass = new Map<string, number[][]>();
  for (const s of samples) {
    const v = featureVector(s.features);
    if (!v) continue;
    const list = byClass.get(s.classId) ?? [];
    list.push(v);
    byClass.set(s.classId, list);
  }
  if (byClass.size === 0) throw new Error('no usable enrollment hits');
  const dims = TIMBRE_FEATURES.length;

  const means = new Map<string, number[]>();
  const withinSq = new Array<number>(dims).fill(0);
  let n = 0;
  for (const [id, list] of byClass) {
    const mean = new Array<number>(dims).fill(0);
    for (const v of list) v.forEach((x, i) => (mean[i]! += x / list.length));
    means.set(id, mean);
    for (const v of list) v.forEach((x, i) => (withinSq[i]! += (x - mean[i]!) ** 2));
    n += list.length;
  }
  // within-class spread, floored; with ≥2 classes also never below a fraction of the between-class spread
  const scale = withinSq.map((s, i) =>
    Math.max(Math.sqrt(s / Math.max(1, n)) * 1.5, MIN_SCALE[i]!),
  );

  const classes: TimbreClassModel[] = [];
  for (const [id, list] of byClass) {
    const mean = means.get(id)!;
    const radius = Math.max(...list.map((v) => distance(v, mean, scale)));
    classes.push({ id, mean, count: list.length, radius });
  }
  return { version: 1, classes, scale };
}

export function classify(
  model: TimbreModel,
  features: Readonly<Record<string, number>> | undefined,
): Classification | null {
  const v = featureVector(features);
  if (!v || model.classes.length === 0) return null;
  let best = model.classes[0]!;
  let bestD = Infinity;
  let second = Infinity;
  for (const c of model.classes) {
    const d = distance(v, c.mean, model.scale);
    if (d < bestD) {
      second = bestD;
      bestD = d;
      best = c;
    } else if (d < second) second = d;
  }
  const limit = Math.max(best.radius, MIN_RADIUS) * REJECT_FACTOR;
  const accepted = model.classes.length === 1 || bestD <= limit;
  return {
    id: accepted ? best.id : null,
    nearest: best.id,
    distance: bestD,
    margin: Number.isFinite(second) ? second - bestD : 0,
  };
}

/** Standardized distance between two classes' centres. Below ~2.5 they will be confused. */
export function classSeparation(model: TimbreModel, a: string, b: string): number {
  const ca = model.classes.find((c) => c.id === a);
  const cb = model.classes.find((c) => c.id === b);
  if (!ca || !cb) return Infinity;
  return distance(ca.mean, cb.mean, model.scale);
}

export const MIN_SEPARATION = 2.5;

// ---- validation / persistence ------------------------------------------------

/** Returns a model from untrusted JSON (localStorage), or null if it is not one. */
export function parseTimbreModel(raw: unknown): TimbreModel | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r['version'] !== 1 || !Array.isArray(r['classes']) || !Array.isArray(r['scale'])) return null;
  const dims = TIMBRE_FEATURES.length;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const scale = r['scale'];
  if (scale.length !== dims || !scale.every((x) => num(x) && x > 0)) return null;
  const classes: TimbreClassModel[] = [];
  for (const c of r['classes']) {
    if (typeof c !== 'object' || c === null) return null;
    const o = c as Record<string, unknown>;
    if (typeof o['id'] !== 'string' || !Array.isArray(o['mean']) || o['mean'].length !== dims)
      return null;
    if (!o['mean'].every(num) || !num(o['count']) || !num(o['radius'])) return null;
    classes.push({
      id: o['id'],
      mean: o['mean'] as number[],
      count: o['count'],
      radius: o['radius'],
    });
  }
  if (classes.length === 0) return null;
  return { version: 1, classes, scale: scale as number[] };
}

/** The subset of Web Storage the store needs, so tests can fake it. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storeKey = (profileId: string) => `lineup.timbre.${profileId}`;

/**
 * Saves the enrolled model per profile. localStorage can be missing, full or
 * blocked (private windows), so every access is guarded and failures degrade
 * to "no saved model".
 */
export class TimbreModelStore {
  constructor(private readonly storage: () => KeyValueStorage | undefined) {}

  load(profileId: string, expectedClasses?: readonly string[]): TimbreModel | null {
    try {
      const text = this.storage()?.getItem(storeKey(profileId));
      if (!text) return null;
      const model = parseTimbreModel(JSON.parse(text));
      if (!model) return null;
      if (expectedClasses) {
        const have = model.classes
          .map((c) => c.id)
          .sort()
          .join();
        if (have !== [...expectedClasses].sort().join()) return null; // profile's classes changed
      }
      return model;
    } catch {
      return null;
    }
  }

  /** Returns false if it could not be saved. */
  save(profileId: string, model: TimbreModel): boolean {
    try {
      const s = this.storage();
      if (!s) return false;
      s.setItem(storeKey(profileId), JSON.stringify(model));
      return true;
    } catch {
      return false;
    }
  }

  clear(profileId: string): void {
    try {
      this.storage()?.removeItem(storeKey(profileId));
    } catch {
      // nothing to clear
    }
  }
}

/** The lane for a classified hit, via the profile's timbre → lane mapping (undefined = unknown sound). */
export function laneForClass(
  lanes: readonly { id: string; timbre?: string }[] | undefined,
  classId: string | null,
): string | undefined {
  if (classId === null || !lanes) return undefined;
  if (lanes.length === 1) return lanes[0]!.id; // single-lane: any hit lands in the lane
  return lanes.find((l) => l.timbre === classId)?.id;
}
