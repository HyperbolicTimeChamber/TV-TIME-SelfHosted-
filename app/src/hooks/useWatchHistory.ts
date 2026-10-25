import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../stores";
import { CacheKey, HistoryFilter, HistorySort, MediaType } from "../enums";
import type { HistoryChange, HistoryEntry, HistoryState } from "../types";
import { historyFilterStatuses, isDefaultHistoryView } from "../utils/historyView";
import {
	fetchHistoryDelta,
	fetchHistoryEntry,
	fetchHistoryPage,
	fetchHistoryViewPage,
} from "../services/historyApi";
import {
	applyChange,
	deriveHistoryCard,
	mergeEntries,
	onHistoryChange,
	showDocId,
	todayStr,
	withHistoryCatalogs,
	localizeCatalog,
	type HistoryCard,
} from "../utils";
import { getCachedCatalogShow, whenCatalogRestored } from "./useWatchlist";
import { catalogSettled, ensureFreshCatalogs } from "./catalogRefresh";

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
		// Re-derive local air days (timezone may have changed since it was cached)
		Object.values(parsed.catalogs ?? {}).forEach(localizeCatalog);
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
				if (saved && (Object.values(HistorySort) as string[]).includes(saved))
					setSort(saved as HistorySort);
			})
			.catch(() => {});
	}, []);
	const choose = useCallback((next: HistorySort) => {
		setSort(next);
		AsyncStorage.setItem(CacheKey.HISTORY_SORT, next).catch(() => {});
	}, []);
	return [sort, choose];
}

const NO_FILTERS: ReadonlySet<HistoryFilter> = new Set();

/** A sorted / filtered view: pages straight from Firestore (not cached — 20 reads a page) */
function useHistoryView(
	userId: string | undefined,
	mediaType: MediaType,
	sort: HistorySort,
	filters: ReadonlySet<HistoryFilter>,
	enabled: boolean,
) {
	const statuses = historyFilterStatuses(filters);
	const viewKey = `${mediaType}|${sort}|${statuses.join(",")}`;
	const [view, setView] = useState<{ key: string; items: HistoryEntry[]; hasMore: boolean } | null>(
		null,
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const current = view?.key === viewKey ? view : null;

	const fetchPage = useCallback(
		async (after: HistoryEntry | null) => {
			if (!userId) return;
			setBusy(true);
			try {
				const page = await fetchHistoryViewPage(userId, mediaType, sort, statuses, after);
				setView((prev) => {
					const base = after && prev?.key === viewKey ? prev.items : [];
					const seen = new Set(base.map((e) => e.id));
					return {
						key: viewKey,
						items: [...base, ...page.entries.filter((e) => !seen.has(e.id))],
						hasMore: page.hasMore,
					};
				});
				setError(null);
			} catch (err) {
				console.error("[watchHistory] view page failed:", err);
				setError("Couldn't load your watch history");
			} finally {
				setBusy(false);
			}
		},
		// statuses is derived from viewKey
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[userId, viewKey],
	);

	// New view (sort / filters / tab) → its first page
	useEffect(() => {
		if (enabled) fetchPage(null);
	}, [enabled, fetchPage]);

	const loadMore = useCallback(() => {
		if (!current?.hasMore || busy) return;
		fetchPage(current.items[current.items.length - 1] ?? null);
	}, [current, busy, fetchPage]);

	return {
		items: current?.items ?? null,
		hasMore: current?.hasMore ?? true,
		busy,
		error,
		loadMore,
	};
}

/**
 * Watch History for one tab. Default view (SWR): cached cards render immediately, a delta
 * query (`historyUpdatedAt > checkedAt`) refreshes them quietly, pages of 20 load on demand.
 * Another sort / status filter pages from Firestore with that order / filter.
 */
export function useWatchHistory(
	mediaType: MediaType,
	sort: HistorySort = HistorySort.LAST_WATCHED,
	filters: ReadonlySet<HistoryFilter> = NO_FILTERS,
) {
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

	// Persisted catalog cache restores in the background — re-derive once it's in
	useEffect(() => {
		let cancelled = false;
		whenCatalogRestored().then(() => !cancelled && setCatalogVersion((v) => v + 1));
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!state) return;
		ensureFreshCatalogs(state.items)
			// Failed → re-derive anyway: those cards stop waiting and render what they have
			.catch(() => true)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1));
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

	const isDefault = isDefaultHistoryView(sort, filters);
	const view = useHistoryView(userId, mediaType, sort, filters, !isDefault);

	const viewItems = view.items;
	const entries = useMemo(
		() => (isDefault ? (state?.items ?? []) : (viewItems ?? [])),
		[isDefault, state?.items, viewItems],
	);
	// Catalog details (logo, backdrop, status) for a view's titles too
	useEffect(() => {
		if (isDefault || !view.items?.length) return;
		ensureFreshCatalogs(view.items)
			.catch(() => true)
			.then((fetched) => fetched && setCatalogVersion((v) => v + 1));
	}, [isDefault, view.items]);

	// Shared catalog first, else the copy kept with the list (cold catalog cache / slow network)
	const kept = state?.catalogs;
	const cards: HistoryCard[] = useMemo(() => {
		const today = todayStr();
		return entries.map((e) =>
			deriveHistoryCard(
				e,
				getCachedCatalogShow(e.tmdbId, e.mediaType) ?? kept?.[e.id] ?? null,
				today,
				catalogSettled(e.tmdbId, e.mediaType),
			),
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [entries, kept, catalogVersion]);

	// Keep each card's catalog with the cached list, so the next open renders it from disk
	useEffect(() => {
		if (!userId || entries.length === 0) return;
		const latest = states.get(storeKey(userId, mediaType));
		if (!latest) return;
		const next = withHistoryCatalogs(latest, entries, (e) =>
			getCachedCatalogShow(e.tmdbId, e.mediaType),
		);
		if (next !== latest) save(mediaType, next);
	}, [userId, mediaType, entries, catalogVersion]);

	if (!isDefault) {
		return {
			cards,
			loading: view.items === null,
			loadingMore: view.busy && view.items !== null,
			hasMore: view.hasMore,
			error: view.error,
			loadMore: view.loadMore,
		};
	}
	return {
		cards,
		loading: loading && !state,
		loadingMore,
		hasMore: state?.hasMore ?? true,
		error,
		loadMore,
	};
}
