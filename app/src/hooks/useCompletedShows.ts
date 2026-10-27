import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, WatchStatus, MediaType, HistorySort } from "../enums";
import type { HistoryEntry } from "../types";
import { cacheCatalogShows, getCachedCatalogShow } from "./useWatchlist";
import { fetchCatalogShows, fetchHistoryDelta, fetchHistoryViewPage } from "../services/historyApi";
import {
	onShowCompleted,
	onHistoryChange,
	showDocId,
	buildCompletedSections as buildSections,
	mergeCompleted,
	trimCompleted,
	dropCompleted,
	upsertCompleted,
	completedTypesToRefill,
	COMPLETED_MOVIE_LIMIT,
	COMPLETED_TV_POOL,
	COMPLETED_CACHE_VERSION,
	type CompletedCache,
	type CompletedItem,
	type CompletedSection,
} from "../utils";

export type { CompletedItem, CompletedSection };

const MEDIA_TYPES = [MediaType.MOVIE, MediaType.TV];

// --- Store: the pool behind the rows, persisted (small: ≤70 slim items) ---

let memory: CompletedCache | null = null;
const subscribers = new Set<(cache: CompletedCache) => void>();

function save(cache: CompletedCache) {
	memory = cache;
	subscribers.forEach((fn) => fn(cache));
	AsyncStorage.setItem(CacheKey.COMPLETED_SECTIONS, JSON.stringify(cache)).catch(() => {});
}

/**
 * In-memory cache, else the persisted one. `trusted` = safe to delta-sync; an old-format
 * cache (no cursor) still renders while the first load runs.
 */
async function load(
	userId: string,
): Promise<{ items: CompletedItem[]; cache: CompletedCache | null } | null> {
	if (memory?.userId === userId) return { items: memory.items, cache: memory };
	try {
		const raw = await AsyncStorage.getItem(CacheKey.COMPLETED_SECTIONS);
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed?.userId !== userId || !Array.isArray(parsed.items)) return null;
		if (parsed.version !== COMPLETED_CACHE_VERSION) return { items: parsed.items, cache: null };
		// Another load may have finished while storage was read
		if (memory?.userId !== userId) memory = parsed as CompletedCache;
		return { items: memory.items, cache: memory };
	} catch {
		return null;
	}
}

/** Row → display item: shared catalog when cached, else what the cached item already had */
function toItem(row: HistoryEntry, prev: CompletedItem | undefined): CompletedItem {
	const catalog = getCachedCatalogShow(row.tmdbId, row.mediaType);
	return {
		tmdbId: row.tmdbId,
		mediaType: row.mediaType,
		completedAt: row.historyAt,
		title: catalog?.title ?? prev?.title ?? "",
		posterPath: catalog?.posterPath ?? prev?.posterPath ?? null,
		genres: catalog?.genres ?? prev?.genres ?? [],
	};
}

/**
 * Newest completed titles of one type, paged (20/page) until the limit is filled or the
 * server runs out. Sorted by historyAt = last watch, which for a COMPLETED title is when
 * it was finished (same moment the old lastWatchedAt sort used).
 */
async function fetchNewestCompleted(
	userId: string,
	mediaType: MediaType,
): Promise<{ rows: HistoryEntry[]; exhausted: boolean }> {
	const limit = mediaType === MediaType.MOVIE ? COMPLETED_MOVIE_LIMIT : COMPLETED_TV_POOL;
	const rows: HistoryEntry[] = [];
	let after: HistoryEntry | null = null;
	for (;;) {
		const page = await fetchHistoryViewPage(
			userId,
			mediaType,
			HistorySort.LAST_WATCHED,
			[WatchStatus.COMPLETED],
			after,
		);
		rows.push(...page.entries);
		if (rows.length >= limit) return { rows, exhausted: false };
		if (!page.hasMore) return { rows, exhausted: true };
		// Cursor = last kept row; plays-0 rows after it come back again and are re-filtered
		after = page.entries[page.entries.length - 1] ?? null;
		if (!after) return { rows, exhausted: true };
	}
}

/** Catalogs missing from the shared cache → one batched query, then fill titles / genres */
async function hydrate(cache: CompletedCache): Promise<CompletedCache> {
	const missing = cache.items.filter(
		(i) => !i.title && !getCachedCatalogShow(i.tmdbId, i.mediaType),
	);
	if (missing.length > 0) {
		cacheCatalogShows(
			await fetchCatalogShows(missing.map((i) => showDocId(i.tmdbId, i.mediaType))).catch(() => []),
		);
	}
	let changed = false;
	const items = cache.items.map((i) => {
		if (i.title) return i;
		const catalog = getCachedCatalogShow(i.tmdbId, i.mediaType);
		if (!catalog) return i;
		changed = true;
		return {
			...i,
			title: catalog.title,
			posterPath: catalog.posterPath ?? null,
			genres: catalog.genres ?? [],
		};
	});
	return changed ? { ...cache, items } : cache;
}

/** Replace one type's items with a fresh newest-first fetch */
async function refill(cache: CompletedCache, mediaTypes: MediaType[]): Promise<CompletedCache> {
	const fetched = await Promise.all(
		MEDIA_TYPES.filter((t) => mediaTypes.includes(t)).map(async (t) => ({
			mediaType: t,
			...(await fetchNewestCompleted(cache.userId, t)),
		})),
	);
	let next: CompletedCache = {
		...cache,
		items: cache.items.filter((i) => !mediaTypes.includes(i.mediaType)),
		exhausted: [
			...cache.exhausted.filter((t) => !mediaTypes.includes(t)),
			...fetched.filter((f) => f.exhausted).map((f) => f.mediaType),
		],
	};
	for (const f of fetched) next = mergeCompleted(next, f.rows, toItem);
	return next;
}

/**
 * Trusted cache → delta per type (`historyUpdatedAt > checkedAt`, usually 0 docs = 1 read
 * each); a type that dropped below its limit pages again. No / stale cache → first load.
 */
async function syncCompleted(userId: string): Promise<CompletedCache> {
	const cached = (await load(userId))?.cache ?? null;
	let next: CompletedCache;
	if (cached) {
		const deltas = await Promise.all(
			MEDIA_TYPES.map((t) => fetchHistoryDelta(userId, t, cached.checkedAt)),
		);
		// Local events may have patched the cache while the delta ran
		next = mergeCompleted(memory?.userId === userId ? memory : cached, deltas.flat(), toItem);
		const short = completedTypesToRefill(next);
		if (short.length > 0) next = await refill(next, short);
	} else {
		next = await refill(
			{ version: COMPLETED_CACHE_VERSION, userId, items: [], checkedAt: 0, exhausted: [] },
			MEDIA_TYPES,
		);
	}
	next = await hydrate(next);
	save(next);
	return next;
}

// One sync at a time per user (mount + refetch can overlap)
let inFlight: { userId: string; promise: Promise<CompletedCache> } | null = null;
function sync(userId: string): Promise<CompletedCache> {
	if (inFlight?.userId === userId) return inFlight.promise;
	const promise = syncCompleted(userId).finally(() => {
		if (inFlight?.promise === promise) inFlight = null;
	});
	inFlight = { userId, promise };
	return promise;
}

// Local writes that take a title out of COMPLETED (removal deletes the doc, so the delta
// never sees it) patch the cache even while Profile is closed — no reads
onHistoryChange((change) => {
	if (!change.cleared && (change.status === undefined || change.status === WatchStatus.COMPLETED))
		return;
	load(change.userId)
		.then((res) => {
			if (!res?.cache) return;
			const next = dropCompleted(res.cache, change.tmdbId, change.mediaType);
			if (next !== res.cache) save(next);
		})
		.catch(() => {});
});

/** Display: unresolved catalogs keep a placeholder title (retried on the next sync) */
const toSections = (items: CompletedItem[]) =>
	buildSections(items.map((i) => (i.title ? i : { ...i, title: `Show ${i.tmdbId}` })));

export function useCompletedShows(userId: string | undefined) {
	const [sections, setSections] = useState<CompletedSection[]>([]);
	const [loading, setLoading] = useState(true);

	// Store updates (sync, local events) → rows
	useEffect(() => {
		if (!userId) return;
		const onSave = (cache: CompletedCache) => {
			if (cache.userId === userId) setSections(toSections(cache.items));
		};
		subscribers.add(onSave);
		return () => {
			subscribers.delete(onSave);
		};
	}, [userId]);

	// Cache renders first, then a quiet delta (or the first load)
	useEffect(() => {
		if (!userId) return;
		let cancelled = false;
		(async () => {
			const cached = await load(userId);
			if (cancelled) return;
			if (cached) {
				setSections(toSections(cached.items));
				setLoading(false);
			}
			await sync(userId);
		})()
			.catch((err) => console.error("[completedShows] sync failed:", err))
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [userId]);

	const addCompletedItem = useCallback(
		(item: CompletedItem) => {
			if (!userId) return;
			if (memory?.userId === userId) {
				save(upsertCompleted(memory, item));
				return;
			}
			// No synced cache yet → show it now; the sync's delta brings the server copy
			setSections((prev) => {
				const items = prev
					.flatMap((s) => s.items)
					.filter((i) => !(i.tmdbId === item.tmdbId && i.mediaType === item.mediaType));
				return toSections(trimCompleted([...items, item], []).items);
			});
		},
		[userId],
	);

	// Listen for live completed events
	useEffect(() => {
		return onShowCompleted((event) => {
			addCompletedItem({
				tmdbId: event.tmdbId,
				mediaType: event.mediaType as MediaType,
				title: event.title,
				posterPath: event.posterPath,
				genres: event.genres,
				completedAt: Date.now(),
			});
		});
	}, [addCompletedItem]);

	/** Delta against the cache (first load if none) */
	const refetch = useCallback(async () => {
		if (!userId) return;
		await sync(userId).catch((err) => console.error("[completedShows] refetch failed:", err));
	}, [userId]);

	return { sections, loading, addCompletedItem, refetch };
}
