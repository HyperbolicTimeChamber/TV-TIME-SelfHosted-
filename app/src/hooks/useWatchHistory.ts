import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../stores";
import { CacheKey, HistorySort, MediaType } from "../enums";
import type { HistoryChange, HistoryState } from "../types";
import {
	fetchHistoryDelta,
	fetchHistoryEntry,
	fetchHistoryPage,
	fetchHistoryRest,
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
import { getCachedCatalogShow } from "./useWatchlist";
import { ensureFreshCatalogs } from "./catalogRefresh";

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

// --- Hook ---

/** History sort choice, kept across visits (cache); defaults to last watched */
export function useHistorySort(): [HistorySort, (sort: HistorySort) => void] {
	const [sort, setSort] = useState(HistorySort.LAST_WATCHED);
	useEffect(() => {
		AsyncStorage.getItem(CacheKey.HISTORY_SORT)
			.then((saved) => {
				if (saved && (Object.values(HistorySort) as string[]).includes(saved)) setSort(saved as HistorySort);
			})
			.catch(() => {});
	}, []);
	const choose = useCallback((next: HistorySort) => {
		setSort(next);
		AsyncStorage.setItem(CacheKey.HISTORY_SORT, next).catch(() => {});
	}, []);
	return [sort, choose];
}

/**
 * Watch History for one tab (SWR): cached cards render immediately, a delta query
 * (`historyUpdatedAt > checkedAt`) refreshes them quietly, pages of 20 load on demand.
 * `loadAll` (a sort / filter is on) pulls the rest of the tab once — then it's cached too.
 */
export function useWatchHistory(mediaType: MediaType, loadAll = false) {
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
	const [loadingAll, setLoadingAll] = useState(false);
	const [restFailed, setRestFailed] = useState(false);
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
		ensureFreshCatalogs(state.items)
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

	// Sorting / filtering needs the whole tab: fetch everything after the cached pages, once
	const needRest = loadAll && !!userId && !!state?.hasMore && !restFailed;
	useEffect(() => {
		if (!needRest || !userId) return;
		setLoadingAll(true);
		const current = states.get(storeKey(userId, mediaType));
		fetchHistoryRest(userId, mediaType, current?.items[current.items.length - 1] ?? null)
			.then((rest) => {
				const latest = states.get(storeKey(userId, mediaType)) ?? current ?? emptyState(userId);
				save(mediaType, mergeEntries(latest, rest, false));
			})
			.catch((err) => {
				console.error("[watchHistory] load all failed:", err);
				setRestFailed(true);
				setError("Couldn't load your full history");
			})
			// Not tied to this effect run: saving the rest flips needRest, which re-runs the
			// effect — a "cancelled" guard here left the spinner on forever
			.finally(() => setLoadingAll(false));
	}, [needRest, userId, mediaType]);

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
		/** Fetching the rest of the tab for a sort / filter */
		loadingAll: loadingAll || needRest,
		hasMore: state?.hasMore ?? true,
		error,
		loadMore,
	};
}
