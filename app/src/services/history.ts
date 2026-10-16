import { deleteField, increment, serverTimestamp, Timestamp } from "@react-native-firebase/firestore";

/**
 * Watch History fields merged into tracking-doc writes (mirrors functions/src/shared/history.ts):
 * - historyAt: last watch — list sort key; docs without it never appear in history
 * - historyUpdatedAt: any history-relevant change — delta-sync cursor for cached pages
 * - minutesWatched: total time incl. rewatches
 * - plays: marks minus unmarks; 0 → "not started", hidden from history
 * - lastEpisode: the episode most recently marked watched (TV) — "Last Watched"
 * They ride along on writes the app already makes → no extra Firestore writes.
 */
export function historyOnWatch(
	minutes: number,
	plays = 1,
	at: Timestamp = Timestamp.now(),
	lastEpisode?: { season: number; episode: number },
) {
	return {
		...(lastEpisode ? { lastEpisode } : {}),
		historyAt: at,
		historyUpdatedAt: serverTimestamp(),
		minutesWatched: increment(minutes),
		plays: increment(plays),
	};
}

export function historyOnUnwatch(minutes: number, plays = 1) {
	return {
		historyUpdatedAt: serverTimestamp(),
		minutesWatched: increment(-minutes),
		plays: increment(-plays),
	};
}

/** Everything unwatched (e.g. movie unmarked) → out of history */
export function historyCleared() {
	return {
		historyAt: deleteField(),
		historyUpdatedAt: serverTimestamp(),
		minutesWatched: 0,
		plays: 0,
	};
}

/** Status / pointer change without a watch: stop, resume, rewatch start, skip */
export function historyOnChange() {
	return { historyUpdatedAt: serverTimestamp() };
}
