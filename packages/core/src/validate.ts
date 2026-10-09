/**
 * Tiny validation toolkit that produces error messages a human can read on a
 * phone: every message starts with the path to the offending field, says what
 * was expected, and shows what was actually found.
 */

export type Loaded<T> =
  { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

const MAX_REPORTED = 12;

export class Problems {
  readonly errors: string[] = [];
  readonly warnings: string[] = [];

  error(path: string, message: string): void {
    this.errors.push(path ? `${path}: ${message}` : message);
  }

  warn(path: string, message: string): void {
    this.warnings.push(path ? `${path}: ${message}` : message);
  }

  get ok(): boolean {
    return this.errors.length === 0;
  }

  /** Errors capped for small screens, with a count of what was cut. */
  report(): string[] {
    if (this.errors.length <= MAX_REPORTED) return [...this.errors];
    const more = this.errors.length - MAX_REPORTED;
    return [
      ...this.errors.slice(0, MAX_REPORTED),
      `…and ${more} more problem${more === 1 ? '' : 's'}`,
    ];
  }

  result<T>(value: T): Loaded<T> {
    return this.ok
      ? { ok: true, value, warnings: this.warnings }
      : { ok: false, errors: this.report() };
  }
}

export const join = (path: string, key: string): string => (path ? `${path}.${key}` : key);
export const at = (path: string, index: number): string => `${path}[${index}]`;

export function describeValue(v: unknown): string {
  if (v === undefined) return 'nothing';
  if (v === null) return 'null';
  if (typeof v === 'string') return JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `a list of ${v.length}`;
  return 'an object';
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface NumOpts {
  min?: number;
  max?: number;
  integer?: boolean;
  required?: boolean;
}

function rangeText({ min, max, integer }: NumOpts): string {
  const kind = integer ? 'a whole number' : 'a number';
  if (min !== undefined && max !== undefined) return `${kind} from ${min} to ${max}`;
  if (min !== undefined) return `${kind} ≥ ${min}`;
  if (max !== undefined) return `${kind} ≤ ${max}`;
  return kind;
}

export function readNumber(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  opts: NumOpts = {},
): number | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, `required, expected ${rangeText(opts)}`);
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    p.error(here, `expected ${rangeText(opts)} (got ${describeValue(v)})`);
    return undefined;
  }
  if (
    (opts.min !== undefined && v < opts.min) ||
    (opts.max !== undefined && v > opts.max) ||
    (opts.integer && !Number.isInteger(v))
  ) {
    p.error(here, `expected ${rangeText(opts)} (got ${v})`);
    return undefined;
  }
  return v;
}

export function readString(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  opts: { required?: boolean; maxLength?: number } = {},
): string | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, 'required, expected non-empty text');
    return undefined;
  }
  if (typeof v !== 'string' || v.trim() === '') {
    p.error(here, `expected non-empty text (got ${describeValue(v)})`);
    return undefined;
  }
  if (opts.maxLength !== undefined && v.length > opts.maxLength) {
    p.error(here, `expected at most ${opts.maxLength} characters (got ${v.length})`);
    return undefined;
  }
  return v;
}

export function readBoolean(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  opts: { required?: boolean } = {},
): boolean | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, 'required, expected true or false');
    return undefined;
  }
  if (typeof v !== 'boolean') {
    p.error(here, `expected true or false (got ${describeValue(v)})`);
    return undefined;
  }
  return v;
}

export function readEnum<T extends string>(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  allowed: readonly T[],
  opts: { required?: boolean } = {},
): T | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, `required, expected one of ${allowed.join(', ')}`);
    return undefined;
  }
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    p.error(here, `expected one of ${allowed.join(', ')} (got ${describeValue(v)})`);
    return undefined;
  }
  return v as T;
}

export function readObject(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  opts: { required?: boolean } = {},
): Record<string, unknown> | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, 'required, expected an object');
    return undefined;
  }
  if (!isRecord(v)) {
    p.error(here, `expected an object (got ${describeValue(v)})`);
    return undefined;
  }
  return v;
}

export function readArray(
  obj: Record<string, unknown>,
  key: string,
  path: string,
  p: Problems,
  opts: { required?: boolean; minLength?: number } = {},
): unknown[] | undefined {
  const v = obj[key];
  const here = join(path, key);
  if (v === undefined) {
    if (opts.required) p.error(here, 'required, expected a list');
    return undefined;
  }
  if (!Array.isArray(v)) {
    p.error(here, `expected a list (got ${describeValue(v)})`);
    return undefined;
  }
  if (opts.minLength !== undefined && v.length < opts.minLength) {
    p.error(
      here,
      `expected at least ${opts.minLength} item${opts.minLength === 1 ? '' : 's'} (got ${v.length})`,
    );
    return undefined;
  }
  return v;
}

/** Warns about unknown keys (typos), with a nearest-name hint. */
export function warnUnknownKeys(
  obj: Record<string, unknown>,
  known: readonly string[],
  path: string,
  p: Problems,
): void {
  for (const key of Object.keys(obj)) {
    if (known.includes(key)) continue;
    const hint = known.find((k) => editDistance(k.toLowerCase(), key.toLowerCase()) <= 2);
    p.warn(
      join(path, key),
      hint ? `unknown field (did you mean "${hint}"?)` : 'unknown field, ignored',
    );
  }
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * Turns a JSON.parse error message into something a person can act on. Engines
 * word these differently: older V8 says "at position N", Firefox says "at line
 * L column C", current V8 and Safari give a snippet or nothing. We use a
 * location when the engine gave one and otherwise pass the message through.
 */
export function describeJsonError(text: string, message: string): string {
  const pos = /position (\d+)/.exec(message);
  if (pos) {
    const index = Number(pos[1]);
    const before = text.slice(0, index);
    const line = before.split('\n').length;
    const column = index - before.lastIndexOf('\n');
    return `not valid JSON: ${message} (line ${line}, column ${column})`;
  }
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return `not valid JSON: ${message} (line ${lc[1]}, column ${lc[2]})`;
  return `not valid JSON: ${message}`;
}

export function parseJson(text: string): Loaded<unknown> {
  try {
    return { ok: true, value: JSON.parse(text) as unknown, warnings: [] };
  } catch (err) {
    return {
      ok: false,
      errors: [describeJsonError(text, err instanceof Error ? err.message : String(err))],
    };
  }
}
