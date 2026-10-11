import { chartEnd, rateChart, starString, type Chart } from '@lineup/core';

/**
 * "Traditional · 100 bpm · 0:20 · 48 notes · Easy ★★☆☆☆ (3/10) · diatonic": what to show under a
 * song picker.
 */
export function songSummary(chart: Chart): string {
  const secs = Math.round(chartEnd(chart));
  const length = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const parts = [
    chart.meta.artist,
    `${Math.round(chart.meta.bpm)} bpm`,
    length,
    `${chart.notes.length} ${chart.notes.length === 1 ? 'note' : 'notes'}`,
  ];
  if (chart.notes.length > 0) {
    const rating = rateChart(chart);
    parts.push(`${rating.label} ${starString(rating.stars)} (${rating.score}/10)`);
    if (rating.scale) parts.push(rating.scale);
  }
  return parts.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}
