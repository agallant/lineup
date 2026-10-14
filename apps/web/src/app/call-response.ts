/**
 * The word to show as a call-and-response bar starts: "Listen…" for the first beat of each call and
 * "Your turn!" for the first beat of each answer, or null at any other time.
 */
export function callSignal(
  listen: { calls?: { from: number; to: number }[]; responses?: { from: number; to: number }[] },
  now: number,
  spb: number,
): string | null {
  if (listen.calls?.some((c) => now >= c.from && now < c.from + spb)) return 'Listen…';
  if (listen.responses?.some((r) => now >= r.from && now < r.from + spb)) return 'Your turn!';
  return null;
}
