import { chartEnd, type Chart } from '@lineup/core';

/** "Traditional · 100 bpm · 0:20 · 48 notes": what to show under a song picker. */
export function songSummary(chart: Chart): string {
  const secs = Math.round(chartEnd(chart));
  const length = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const parts = [
    chart.meta.artist,
    `${Math.round(chart.meta.bpm)} bpm`,
    length,
    `${chart.notes.length} ${chart.notes.length === 1 ? 'note' : 'notes'}`,
  ];
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}
