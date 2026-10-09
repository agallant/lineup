import { loadProfile, type InstrumentProfile } from '../profile';
import ukuleleNote from './ukulele-note.json';
import clap from './clap.json';
import drumKit from './drum-kit.json';
import handPercussion from './hand-percussion.json';
import voice from './voice.json';
import ukuleleStrum from './ukulele-strum.json';

const RAW: readonly unknown[] = [ukuleleStrum, ukuleleNote, voice, clap, handPercussion, drumKit];

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
  const p = builtinProfiles[id];
  if (!p)
    throw new Error(
      `unknown instrument profile "${id}" (have: ${Object.keys(builtinProfiles).join(', ')})`,
    );
  return p;
}
