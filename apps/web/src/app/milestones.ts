import { buildCollection, earnedBadges } from './collection';
import type { Achievement, ProgressStore } from './progress';
import { completedCourse } from './scoreboard';
import type { BestScore } from './scores';

/**
 * Awards the trophies that come from the whole of what has been played rather than one song:
 * finishing a learning path, and the first and the first gold collection badge. Returns the ones
 * earned just now, to show with the result.
 */
export function grantMilestones(
  progress: ProgressStore,
  entries: readonly { key: string; best: BestScore }[],
): Achievement[] {
  const earned: (Achievement | null)[] = [];
  if (completedCourse(entries)) earned.push(progress.grant('graduate'));
  const badges = earnedBadges(buildCollection(entries));
  if (badges.length > 0) earned.push(progress.grant('collector'));
  if (badges.some((b) => b.tier === 'gold')) earned.push(progress.grant('curator'));
  return earned.filter((a): a is Achievement => a !== null);
}
