import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../stores";
import { CacheKey, MediaType } from "../enums";
import type { HistoryChange, HistoryState } from "../types";
import {
	fetchCatalogShows,
	fetchHistoryDelta,
	fetchHistoryEntry,
	fetchHistoryPage,
} from "../services/historyApi";
import {
	applyChange,
	deriveHistoryCard,
	mergeEntries,
	onHistoryChange,
	showDocId,
	todayStr,
	type HistoryCard,
} from "../utils";
import { cacheCatalogShows, getCachedCatalogShow } from "./useWatchlist";

// --- Store: one cached list per (user, tab), persisted to AsyncStorage (localStorage on web) ---

const states = new Map<string, HistoryState>();
const subscribers = new Set<() => void>();
const storeKey = (userId: string, mediaType: MediaType) => `${userId}_${mediaType}`;
const storageKey = (mediaType: MediaType) => `${CacheKey.WATCH_HISTORY}_${mediaType}`;

function save(mediaType: MediaType, state: HistoryState) {
	states.set(storeKey(state.userId, mediaType), state);
	subscribers.forEach((fn) => fn());
	AsyncStorage.setItem(storageKey(mediaType), JSON.stringify(state)).catch(() => {});
}

/** In-memory state, else the persisted one (other account's cache is ignored) */
async function load(userId: string, mediaType: MediaType): Promise<HistoryState | null> {
	const inMemory = states.get(storeKey(userId, mediaType));
	if (inMemory) return inMemory;
	try {
		const raw = await AsyncStorage.getItem(storageKey(mediaType));
		const parsed = raw ? (JSON.parse(raw) as HistoryState) : null;
		if (parsed?.userId !== userId) return null;
		states.set(storeKey(userId, mediaType), parsed);
		subscribers.forEach((fn) => fn());
		return parsed;
	} catch {
		return null;
	}
}

const emptyState = (userId: string): HistoryState => ({
	userId,
	items: [],
	hasMore: true,
	checkedAt: 0,
});

// Local writes patch the cache even while the page is closed — no reads unless a
// watched title isn't cached yet (then just that one tracking doc).
async function handleChange(change: HistoryChange) {
	const state = await load(change.userId, change.mediaType);
	if (!state) return; // never opened → first open fetches fresh
	const { state: patched, missing } = applyChange(state, change);
	save(change.mediaType, patched);
	if (!missing) return;
	const entry = await fetchHistoryEntry(
		change.userId,
		showDocId(change.tmdbId, change.mediaType),
	).catch(() => null);
	const latest = states.get(storeKey(change.userId, change.mediaType)) ?? patched;
	if (entry) save(change.mediaType, mergeEntries(latest, [entry]));
}
onHistoryChange((change) => {
	handleChange(change).catch((err) => console.error("[watchHistory] patch failed:", err));
});

// Asked once per session — a catalog doc that doesn't exist isn't re-read on every update
const catalogRequested = new Set<string>();

/** Catalog docs not cached, or cached before logos existed → fetched in one batch */
async function ensureCatalogs(state: HistoryState): Promise<boolean> {
	const missing = state.items
		.filter((e) => {
			const c = getCachedCatalogShow(e.tmdbId, e.mediaType);
			return !c || !("logoPath" in c);
		})
		.map((e) => showDocId(e.tmdbId, e.mediaType))
		.filter((id) => !catalogRequested.has(id));
	if (missing.length === 0) return false;
	missing.forEach((id) => catalogRequested.add(id));
	cacheCatalogShows(await fetchCatalogShows(missing));
	return true;
}

// --- Hook ---

/**
 * Watch History for one tab (SWR): cached cards render immediately, a delta query
 * (`historyUpdatedAt > checkedAt`) refreshes them quietly, pages of 20 load on demand.
 */
export function useWatchHistory(mediaType: MediaType) {
	const userId = useAuthStore((s) => s.user?.uid);
	const state = useSyncExternalStore(
		useCallback((fn: () => void) => {
			subscribers.add(fn);
			return () => {
				subscribers.delete(fn);
			};
		}, []),
		() => (userId ? (states.get(storeKey(userId, mediaType)) ?? null) : null),
	);
	const [loading, setLoading] = useState(!state);
	const [loadingMore, setLoadingMore] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Catalog cache isn't reactive — bump to re-derive cards after a batch fetch
	const [catalogVersion, setCatalogVersion] = useState(0);

	// Open: cache → quiet delta; no cache → first page
	useEffect(() => {
		if (!userId) return;
		let cancelled = false;
		(async () => {
			const cached = await load(userId, mediaType);
			if (cached) {
				setLoading(false);
				const delta = await fetchHistoryDelta(userId, mediaType, cached.checkedAt);
				const latest = states.get(storeKey(userId, mediaType)) ?? cached;
				if (delta.length > 0) save(mediaType, mergeEntries(latest, delta));
			} else {
				const page = await fetchHistoryPage(userId, mediaType, null);
				save(mediaType, mergeEntries(emptyState(userId), page.entries, page.hasMore));
			}
		})()
			.catch((err) => {
				console.error("[watchHistory] load failed:", err);
				if (!cancelled) setError("Couldn't load your watch history");
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [userId, mediaType]);

	useEffect(() => {
		if (!state) return;
		ensureCatalogs(state)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1))
			.catch(() => {});
	}, [state]);

	const loadMore = useCallback(async () => {
		if (!userId || !state?.hasMore || loadingMore) return;
		setLoadingMore(true);
		try {
			const last = state.items[state.items.length - 1] ?? null;
			const page = await fetchHistoryPage(userId, mediaType, last);
			const latest = states.get(storeKey(userId, mediaType)) ?? state;
			save(mediaType, mergeEntries(latest, page.entries, page.hasMore));
		} catch (err) {
			console.error("[watchHistory] load more failed:", err);
		} finally {
			setLoadingMore(false);
		}
	}, [userId, mediaType, state, loadingMore]);

	const cards: HistoryCard[] = useMemo(() => {
		const today = todayStr();
		return (state?.items ?? []).map((e) =>
			deriveHistoryCard(e, getCachedCatalogShow(e.tmdbId, e.mediaType), today),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state, catalogVersion]);

	return {
		cards,
		loading: loading && !state,
		loadingMore,
		hasMore: state?.hasMore ?? true,
		error,
		loadMore,
	};
}
