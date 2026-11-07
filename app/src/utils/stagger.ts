/** Stand-in for an episode whose runtime isn't known (same as functions/src/shared/stagger) */
export const FALLBACK_EPISODE_MINUTES = 45;

/** Packed bulk mark (Speedster backfill): episodes this far apart, ending now — a catch-up
 *  confirmed in one tap reads as just watched, all of it on top of Previously Watched */
export const PACKED_MARK_GAP_MS = 1000;

/** How far an episode's finish sits before the next one's: its runtime, or the packed gap */
const stepMs = (runtime: number, packed: boolean) =>
	packed ? PACKED_MARK_GAP_MS : (runtime > 0 ? runtime : FALLBACK_EPISODE_MINUTES) * 60_000;

const runMs = (runtimes: number[], packed: boolean) =>
	runtimes.reduce((sum, r) => sum + stepMs(r, packed), 0);

/**
 * For one catch-up sent as several markSeasonWatched calls (one per season, or 100-episode
 * chunks), how long before "now" each call's run should end, so the calls lay end to end
 * instead of all ending now and overlapping. The function staggers each call's episodes back
 * from its end time. Batches in watch order (oldest first); the last ends now.
 */
export function batchEndOffsets(batches: number[][], packed = false): number[] {
	const offsets = new Array<number>(batches.length);
	let offset = 0;
	for (let i = batches.length - 1; i >= 0; i--) {
		offsets[i] = offset;
		offset += runMs(batches[i], packed);
	}
	return offsets;
}

/**
 * When each episode of a bulk mark counts as finished: back to back, the last at `endMs`.
 * Mirrors staggerFinishTimes in functions/src/shared/stagger (what markSeasonWatched writes),
 * so the instant cache updates match what the server stores. Runtimes oldest first; epoch ms
 * in the same order.
 */
export function staggerFinishTimes(runtimes: number[], endMs: number, packed = false): number[] {
	const times = new Array<number>(runtimes.length);
	let finish = endMs;
	for (let i = runtimes.length - 1; i >= 0; i--) {
		times[i] = finish;
		finish -= stepMs(runtimes[i], packed);
	}
	return times;
}
