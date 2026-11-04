/** Stand-in for an episode whose runtime isn't known */
export const FALLBACK_EPISODE_MINUTES = 45;
/** Furthest back a client may ask a run to end (multi-season / chunked marks) */
export const MAX_END_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;

/** Packed bulk mark (Speedster backfill): episodes this far apart, ending at the end time */
export const PACKED_MARK_GAP_MS = 1000;

const stepMs = (runtime: number | null | undefined, packed: boolean) =>
  packed
    ? PACKED_MARK_GAP_MS
    : (runtime && runtime > 0 ? runtime : FALLBACK_EPISODE_MINUTES) * 60_000;

/**
 * When each episode of a bulk mark was "finished", as if watched back to back and the last one
 * finished at `endMs`: each earlier episode finished when the next one started. Bulk marks used
 * to stamp every episode with one shared time, which piled a whole catch-up onto a single day
 * in the watch rate charts and left their order arbitrary.
 *
 * Episodes are laid out in the order given (callers pass them oldest first). Returns epoch ms,
 * in the same order. `packed`: PACKED_MARK_GAP_MS apart instead (a catch-up confirmed in one
 * tap reads as just watched).
 */
export function staggerFinishTimes(
  runtimes: Array<number | null | undefined>,
  endMs: number,
  packed = false,
): number[] {
  const times = new Array<number>(runtimes.length);
  let finish = endMs;
  for (let i = runtimes.length - 1; i >= 0; i--) {
    times[i] = finish;
    finish -= stepMs(runtimes[i], packed);
  }
  return times;
}
