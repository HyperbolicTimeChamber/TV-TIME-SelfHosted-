/**
 * An episode record's watch times (users/{uid}/watchedEpisodes): `watchedAt` = its first watch,
 * `lastWatchedAt` = its latest (its Previously Watched place), and the watch before the latest
 * (`prevWatchedAt`), paired with the latest it was kept for (`prevWatchedFor`) — so undoing one
 * play puts the row back where the previous watch had it. Only single-episode marks keep it
 * (they read the record anyway); a later write that moves `lastWatchedAt` without it (season
 * marks, imports, Cloud Functions) breaks the pair, and the stale value is ignored.
 */

/** Firestore Timestamp, structurally (app RNFirebase / web SDK) */
export interface WatchStamp {
	toMillis(): number;
}

export interface EpisodeWatchTimes<T extends WatchStamp = WatchStamp> {
	watchedAt?: T;
	lastWatchedAt?: T;
	prevWatchedAt?: T;
	prevWatchedFor?: T;
}

/**
 * Fields for one more watch at `now`, off the record as it was (`before`, undefined = none):
 * - no record yet → `watchedAt` too (a re-mark after a full unwatch used to leave records
 *   without one, so an unwatch had no first watch to put the row back to)
 * - a last watch already there → kept as `prevWatchedAt`, paired with this watch
 */
export function watchTimesOnMark<T extends WatchStamp>(
	before: EpisodeWatchTimes<T> | undefined,
	now: T,
): EpisodeWatchTimes<T> & { lastWatchedAt: T } {
	const prev = before?.lastWatchedAt ?? before?.watchedAt;
	return {
		lastWatchedAt: now,
		...(!before ? { watchedAt: now } : {}),
		...(prev ? { prevWatchedAt: prev, prevWatchedFor: now } : {}),
	};
}

/**
 * Where the last watch goes when `removed` plays come off, leaving `final` (> 0) watches:
 * one play off the watch its `prevWatchedAt` was kept for → that previous watch (a rewatch
 * run's earlier time, not the first-ever one); else at or below `restoreAtOrBelow` → its first
 * watch; else it stays (older watch times aren't kept). null → leave lastWatchedAt as is.
 */
export function watchTimeOnUnwatch<T extends WatchStamp>(
	data: EpisodeWatchTimes<T> | undefined,
	removed: number,
	final: number,
	restoreAtOrBelow: number,
): T | null {
	if (final <= 0 || removed <= 0) return null;
	const { prevWatchedAt, prevWatchedFor, lastWatchedAt, watchedAt } = data ?? {};
	if (
		removed === 1 &&
		prevWatchedAt &&
		prevWatchedFor &&
		lastWatchedAt &&
		prevWatchedFor.toMillis() === lastWatchedAt.toMillis()
	)
		return prevWatchedAt;
	if (final <= restoreAtOrBelow && watchedAt) return watchedAt;
	return null;
}
