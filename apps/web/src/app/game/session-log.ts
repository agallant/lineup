import type { Judgment, ScoreState } from '@lineup/core';

export interface SessionLogInput {
  /** Build label, commit and time (the page footer text). */
  build: string;
  mode: 'Singline' | 'Windline' | 'Beatline';
  at: Date;
  userAgent: string;
  profileId: string;
  songTitle: string;
  demo: boolean;
  /** Singing difficulty, key shift etc.: anything worth knowing about the setup. */
  options: Record<string, string | number | boolean>;
  audio: { sampleRate: number; baseLatency?: number; outputLatency?: number } | null;
  /** The calibration offset the judge used, ms. */
  latencyOffsetMs: number;
  /** Mic constraints the browser reports (echo cancellation etc.), when a live mic is open. */
  micSettings?: object | undefined;
  score: ScoreState;
  grade: string;
  judgments: readonly Judgment[];
  /** Extra hits that matched no note (Beatline). */
  strays?: number;
  /** The hit monitor text (Beatline). */
  hits?: string;
}

const num = (v: number | null | undefined, digits = 2, unit = ''): string =>
  v === null || v === undefined || !Number.isFinite(v) ? '-' : `${v.toFixed(digits)}${unit}`;

const signed = (v: number | null | undefined, digits: number, unit: string): string =>
  v === null || v === undefined || !Number.isFinite(v)
    ? '-'
    : `${v >= 0 ? '+' : ''}${v.toFixed(digits)}${unit}`;

/**
 * A plain-text report of one play-through, meant to be pasted into a chat or an
 * issue: the build, the device's audio setup, the scoring and every note's result.
 */
export function formatSessionLog(i: SessionLogInput): string {
  const out: string[] = [];
  out.push(`Lineup session log: ${i.mode}${i.demo ? ' (auto-play demo)' : ''}`);
  out.push(`build:   ${i.build}`);
  out.push(`when:    ${i.at.toISOString()}`);
  out.push(`device:  ${i.userAgent}`);
  out.push(`profile: ${i.profileId}   song: ${i.songTitle}`);
  const opts = Object.entries(i.options).map(([k, v]) => `${k}=${String(v)}`);
  if (opts.length) out.push(`options: ${opts.join('  ')}`);
  if (i.audio) {
    out.push(
      `audio:   ${i.audio.sampleRate} Hz  baseLatency ${num(i.audio.baseLatency === undefined ? undefined : i.audio.baseLatency * 1000, 1, ' ms')}  outputLatency ${num(i.audio.outputLatency === undefined ? undefined : i.audio.outputLatency * 1000, 1, ' ms')}`,
    );
  }
  out.push(`offset:  ${num(i.latencyOffsetMs, 0, ' ms')} applied`);
  if (i.micSettings) {
    const m = i.micSettings as Record<string, unknown>;
    out.push(
      `mic:     echoCancellation=${String(m['echoCancellation'])} noiseSuppression=${String(m['noiseSuppression'])} autoGainControl=${String(m['autoGainControl'])} channels=${String(m['channelCount'])}`,
    );
  }
  const c = i.score.counts;
  out.push('');
  out.push(
    `score ${i.score.score}  accuracy ${Math.round(i.score.accuracy * 100)}%  grade ${i.grade}  perfect ${c.perfect}  good ${c.good}  miss ${c.miss}  best combo ${i.score.maxCombo}${i.strays === undefined ? '' : `  extra hits ${i.strays}`}`,
  );
  out.push('');
  out.push('notes (time, pitch/lane, result, coverage, pitch error, timing error):');
  for (const j of i.judgments) {
    const n = j.note;
    const what = n.pitch !== undefined ? `midi ${n.pitch}` : (n.lane ?? '-');
    const reason = j.reason ? ` (${j.reason})` : '';
    out.push(
      `  #${String(j.noteIndex).padStart(2)} t=${num(n.t)}s ${what.padEnd(8)} ${j.grade}${reason}  cov ${num(j.coverage)}  pitch ${signed(j.pitchErrorCents, 0, ' c')}  timing ${signed(j.timingError === null ? null : j.timingError * 1000, 0, ' ms')}`,
    );
  }
  if (i.hits) {
    out.push('');
    out.push('hit monitor:');
    out.push(i.hits);
  }
  return out.join('\n');
}
