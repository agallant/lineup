import { loadProfile, type InstrumentProfile } from '../profile';
import ukuleleNote from './ukulele-note.json';
import ukuleleStrum from './ukulele-strum.json';

const RAW: readonly unknown[] = [ukuleleStrum, ukuleleNote];

/** Built-in profiles, validated when this module loads (a bad one fails every test). */
export const builtinProfiles: Readonly<Record<string, InstrumentProfile>> = Object.fromEntries(
  RAW.map((raw) => {
    const r = loadProfile(raw);
    if (!r.ok) {
      const id = (raw as { id?: string }).id ?? '?';
      throw new Error(`built-in profile "${id}" is invalid:\n${r.errors.join('\n')}`);
    }
    return [r.value.id, r.value] as const;
  }),
);

export function getProfile(id: string): InstrumentProfile {
  // own keys only: "constructor" / "toString" must read as unknown ids, not Object.prototype members
  const p = Object.hasOwn(builtinProfiles, id) ? builtinProfiles[id] : undefined;
  if (!p)
    throw new Error(
      `unknown instrument profile "${id}" (have: ${Object.keys(builtinProfiles).join(', ')})`,
    );
  return p;
}
