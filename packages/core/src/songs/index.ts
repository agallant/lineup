import { loadChart, type Chart } from '../chart';
import singlineDemo from './singline-demo.json';
import singlineScale from './singline-scale.json';
import ukuleleNotesDemo from './ukulele-notes-demo.json';
import ukuleleStrumDemo from './ukulele-strum-demo.json';

const RAW: Record<string, unknown> = {
  'ukulele-strum-demo': ukuleleStrumDemo,
  'ukulele-notes-demo': ukuleleNotesDemo,
  'singline-demo': singlineDemo,
  'singline-scale': singlineScale,
};

/** Built-in songs, validated when this module loads (a bad one fails every test). */
export const builtinSongs: Readonly<Record<string, Chart>> = Object.fromEntries(
  Object.entries(RAW).map(([id, raw]) => {
    const r = loadChart(raw);
    if (!r.ok) throw new Error(`built-in song "${id}" is invalid:\n${r.errors.join('\n')}`);
    return [id, r.value] as const;
  }),
);

export function getSong(id: string): Chart {
  const c = Object.hasOwn(builtinSongs, id) ? builtinSongs[id] : undefined;
  if (!c) throw new Error(`unknown song "${id}" (have: ${Object.keys(builtinSongs).join(', ')})`);
  return c;
}

/** Built-in songs meant for a profile, in menu order. */
export function songsFor(profileId: string): { id: string; chart: Chart }[] {
  return Object.entries(builtinSongs)
    .filter(([, chart]) => chart.meta.instruments?.includes(profileId))
    .map(([id, chart]) => ({ id, chart }));
}
