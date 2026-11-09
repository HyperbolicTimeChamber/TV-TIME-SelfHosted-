import { MediaType, WatchStatus } from "../enums";
import type { HistoryEntry } from "../types";

export interface CompletedItem {
	tmdbId: number;
	mediaType: MediaType;
	title: string;
	posterPath: string | null;
	genres: string[];
	completedAt: number;
}

export interface CompletedSection {
	title: string;
	items: CompletedItem[];
}

const SECTION_LIMIT = 10;

/** "Movies Watched" + "TV Shows Completed" rows on the profile (pure — shared by app and web) */
export function buildCompletedSections(items: CompletedItem[]): CompletedSection[] {
	const sections: CompletedSection[] = [];

	// Movies
	const movies = items
		.filter((i) => i.mediaType === MediaType.MOVIE)
		.sort((a, b) => b.completedAt - a.completedAt)
		.slice(0, SECTION_LIMIT);
	if (movies.length > 0) {
		sections.push({ title: "Movies Watched", items: movies });
	}

	// TV shows — one row
	const tvShows = items
		.filter((i) => i.mediaType === MediaType.TV)
		.sort((a, b) => b.completedAt - a.completedAt)
		.slice(0, SECTION_LIMIT);
	if (tvShows.length > 0) {
		sections.push({ title: "TV Shows Completed", items: tvShows });
	}

	return sections;
}

// --- Cached pool behind the rows (delta-synced from Watch History fields) ---

/** Latest completed movies kept — the Movies row */
export const COMPLETED_MOVIE_LIMIT = SECTION_LIMIT;
/** Latest completed TV shows kept — the TV Shows row */
export const COMPLETED_TV_POOL = 10;
/** Bump when the persisted shape changes → older caches reload from scratch */
export const COMPLETED_CACHE_VERSION = 3;

export interface CompletedCache {
	version: number;
	userId: string;
	items: CompletedItem[];
	/** Newest historyUpdatedAt seen — delta-sync cursor (ms) */
	checkedAt: number;
	/** Media types whose every completed title is in `items` (nothing older on the server) */
	exhausted: MediaType[];
}

const poolLimit = (mediaType: MediaType) =>
	mediaType === MediaType.MOVIE ? COMPLETED_MOVIE_LIMIT : COMPLETED_TV_POOL;
const itemKey = (i: Pick<CompletedItem, "tmdbId" | "mediaType">) => `${i.mediaType}_${i.tmdbId}`;

/**
 * Newest first, cut to each type's limit. A type that loses titles to the cut no longer
 * holds every completed title → not exhausted (a later drop refills it from the server).
 */
export function trimCompleted(
	items: CompletedItem[],
	exhausted: MediaType[],
): { items: CompletedItem[]; exhausted: MediaType[] } {
	const sorted = [...items].sort((a, b) => b.completedAt - a.completedAt);
	const kept: CompletedItem[] = [];
	const nextExhausted = new Set(exhausted);
	for (const mediaType of [MediaType.MOVIE, MediaType.TV]) {
		const ofType = sorted.filter((i) => i.mediaType === mediaType);
		if (ofType.length > poolLimit(mediaType)) nextExhausted.delete(mediaType);
		kept.push(...ofType.slice(0, poolLimit(mediaType)));
	}
	return { items: kept, exhausted: [...nextExhausted] };
}

/**
 * Apply changed tracking rows (a delta): COMPLETED titles with plays upsert (completedAt =
 * last watch), any other status / out of history drops; re-trimmed, cursor advanced.
 * `toItem` turns a row into a display item (catalog lookup — kept out so this stays pure).
 */
export function mergeCompleted(
	cache: CompletedCache,
	rows: HistoryEntry[],
	toItem: (row: HistoryEntry, prev: CompletedItem | undefined) => CompletedItem,
): CompletedCache {
	const byKey = new Map(cache.items.map((i) => [itemKey(i), i]));
	let checkedAt = cache.checkedAt;
	for (const row of rows) {
		checkedAt = Math.max(checkedAt, row.historyUpdatedAt);
		const key = itemKey(row);
		if (row.status === WatchStatus.COMPLETED && row.plays > 0)
			byKey.set(key, toItem(row, byKey.get(key)));
		else byKey.delete(key);
	}
	return { ...cache, ...trimCompleted([...byKey.values()], cache.exhausted), checkedAt };
}

/** Types below their limit that may have older completed titles on the server */
export function completedTypesToRefill(cache: CompletedCache): MediaType[] {
	return [MediaType.MOVIE, MediaType.TV].filter(
		(t) =>
			!cache.exhausted.includes(t) &&
			cache.items.filter((i) => i.mediaType === t).length < poolLimit(t),
	);
}

/** Local write that took a title out of COMPLETED (removed, unwatched, rewatch started) */
export function dropCompleted(
	cache: CompletedCache,
	tmdbId: number,
	mediaType: MediaType,
): CompletedCache {
	const key = itemKey({ tmdbId, mediaType });
	const items = cache.items.filter((i) => itemKey(i) !== key);
	return items.length === cache.items.length ? cache : { ...cache, items };
}

/** Live completion (or a completed movie watched again) → replace, don't duplicate */
export function upsertCompleted(cache: CompletedCache, item: CompletedItem): CompletedCache {
	const items = cache.items.filter((i) => itemKey(i) !== itemKey(item));
	return { ...cache, ...trimCompleted([...items, item], cache.exhausted) };
}
