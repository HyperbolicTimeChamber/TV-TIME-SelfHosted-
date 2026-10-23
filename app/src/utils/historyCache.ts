import type { HistoryCatalog, HistoryChange, HistoryEntry, HistoryState } from "../types";

/** Newest watch first; doc id desc breaks ties — same order as the server query */
const byHistory = (a: HistoryEntry, b: HistoryEntry) =>
	b.historyAt - a.historyAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Upsert server rows (a page or a delta) into the cached list: replaces stale copies,
 * drops rows that left history (plays ≤ 0), keeps newest-watch order, advances the cursor.
 */
export function mergeEntries(
	state: HistoryState,
	entries: HistoryEntry[],
	hasMore = state.hasMore,
): HistoryState {
	const byId = new Map(state.items.map((e) => [e.id, e]));
	let checkedAt = state.checkedAt;
	for (const e of entries) {
		checkedAt = Math.max(checkedAt, e.historyUpdatedAt);
		if (e.plays > 0) byId.set(e.id, e);
		else byId.delete(e.id);
	}
	return { ...state, items: [...byId.values()].sort(byHistory), hasMore, checkedAt };
}

/**
 * Apply a local write without reading Firestore. `missing` = a watch on a title that
 * isn't cached yet → the caller fetches that one tracking doc and merges it.
 */
export function applyChange(
	state: HistoryState,
	change: HistoryChange,
	now = Date.now(),
): { state: HistoryState; missing: boolean } {
	const id = `${change.mediaType}_${change.tmdbId}`;
	const current = state.items.find((e) => e.id === id);
	if (!current) return { state, missing: !!change.watched && !change.cleared };

	if (change.cleared) {
		return { state: { ...state, items: state.items.filter((e) => e.id !== id) }, missing: false };
	}
	const next: HistoryEntry = {
		...current,
		status: change.status ?? current.status,
		nextEpisode: change.nextEpisode !== undefined ? change.nextEpisode : current.nextEpisode,
		rewatchCount: current.rewatchCount + (change.rewatchDelta ?? 0),
		minutesWatched: Math.max(0, current.minutesWatched + (change.minutesDelta ?? 0)),
		plays: current.plays + (change.playsDelta ?? 0),
		lastEpisode: change.lastEpisode ?? current.lastEpisode,
		historyAt: change.watched ? now : current.historyAt,
		historyUpdatedAt: now,
	};
	// Local edits don't move the delta cursor: the server copy still syncs next open
	const items = state.items.filter((e) => e.id !== id);
	if (next.plays > 0) items.push(next);
	return { state: { ...state, items: items.sort(byHistory) }, missing: false };
}


/** The fields a history card reads from a catalog — small enough to persist with the list */
export function toHistoryCatalog(c: HistoryCatalog): HistoryCatalog {
	return {
		title: c.title,
		logoPath: c.logoPath ?? null,
		backdropPath: c.backdropPath ?? null,
		status: c.status,
		releaseDate: c.releaseDate ?? null,
		runtime: c.runtime ?? null,
		seasons: (c.seasons ?? [])
			.filter((s) => s.seasonNumber > 0)
			.map((s) => ({
				seasonNumber: s.seasonNumber,
				episodes: (s.episodes ?? []).map((e) => ({
					episodeNumber: e.episodeNumber,
					airDate: e.airDate,
					...(e.airStamp ? { airStamp: e.airStamp } : {}),
				})),
			})),
	};
}

/**
 * Remember each row's card catalog with the cached list (from the shared catalog cache,
 * via `lookup`); drops ones whose row left. Same state back when nothing changed.
 */
export function withHistoryCatalogs(
	state: HistoryState,
	entries: HistoryEntry[],
	lookup: (entry: HistoryEntry) => HistoryCatalog | null,
): HistoryState {
	const keep = new Set([...state.items, ...entries].map((e) => e.id));
	const prev = state.catalogs ?? {};
	const catalogs: Record<string, HistoryCatalog> = {};
	let changed = false;
	for (const [id, c] of Object.entries(prev)) {
		if (keep.has(id)) catalogs[id] = c;
		else changed = true;
	}
	for (const e of entries) {
		const full = lookup(e);
		if (!full) continue;
		const slim = toHistoryCatalog(full);
		if (prev[e.id] && JSON.stringify(prev[e.id]) === JSON.stringify(slim)) continue;
		catalogs[e.id] = slim;
		changed = true;
	}
	return changed ? { ...state, catalogs } : state;
}
