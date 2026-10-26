/** Stand-in for an episode whose runtime isn't known */
export const FALLBACK_EPISODE_MINUTES = 45;
/** Furthest back a client may ask a run to end (multi-season / chunked marks) */
export const MAX_END_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

const minutesOf = (runtime: number | null | undefined) =>
  runtime && runtime > 0 ? runtime : FALLBACK_EPISODE_MINUTES;

/**
 * When each episode of a bulk mark was "finished", as if watched back to back and the last one
 * finished at `endMs`: each earlier episode finished when the next one started. Bulk marks used
 * to stamp every episode with one shared time, which piled a whole catch-up onto a single day
 * in the watch rate charts and left their order arbitrary.
 *
 * Episodes are laid out in the order given (callers pass them oldest first). Returns epoch ms,
 * in the same order.
 */
export function staggerFinishTimes(
  runtimes: Array<number | null | undefined>,
  endMs: number,
): number[] {
  const times = new Array<number>(runtimes.length);
  let finish = endMs;
  for (let i = runtimes.length - 1; i >= 0; i--) {
    times[i] = finish;
    finish -= minutesOf(runtimes[i]) * 60_000;
  }
  return times;
}
