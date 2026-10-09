import type { EnrollOutcome, TimbreClass } from '@lineup/core';

/** What to tell the player after each enrollment hit. */
export function enrollMessage(
  outcome: EnrollOutcome,
  cls: Pick<TimbreClass, 'label'> | null,
  have: number,
  want: number,
): { text: string; ok: boolean } {
  switch (outcome) {
    case 'accepted':
      return { text: `Got it${cls ? ` (${cls.label} ${have}/${want})` : ''}.`, ok: true };
    case 'double':
      return {
        text: 'That looked like one hit heard twice. Leave a moment between hits.',
        ok: false,
      };
    case 'too-quiet':
      return { text: 'Too quiet. Hit a little harder or closer to the mic.', ok: false };
    case 'outlier':
      return {
        text: 'That sounded different from your other hits. Try to make the same sound each time.',
        ok: false,
      };
    case 'no-features':
      return { text: 'I heard something but could not measure it. Try again.', ok: false };
    case 'done':
      return { text: 'All sounds recorded.', ok: true };
  }
}
