import { useEffect, useState, useRef, useCallback } from "react";
import {
	onShowRemoved,
	onShowAdded,
	showDocId,
	isGenericEpisodeTitle,
	isIncompleteCatalog,
	hasMissingDisplayData,
	needsTmdbHeal,
	selectStaleCatalogItems,
	localizeCatalog,
	nextEpisodeLocalAirDate,
	patchCatalogSeason,
	catalogNextEpisodeTitle,
	type FreshSeasonEpisode,
} from "../utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	getFirestore,
	collection,
	doc,
	getDoc,
	getDocs,
	updateDoc,
	onSnapshot,
	query,
	orderBy,
	limit,
	startAfter,
	QueryDocumentSnapshot,
} from "@react-native-firebase/firestore";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
	TrackingItem,
	CatalogShow,
	CacheKey,
	DocChangeType,
	MediaType,
	QueryKey,
	type TMDBEpisode,
} from "../types";
import { useAuthStore } from "../stores";
import { getShowDetails, getSeasonDetails } from "../services/tmdb";

const PAGE_SIZE = 50;

export interface EnrichedTrackingItem extends TrackingItem {
	title: string;
	posterPath: string | null;
	totalEpisodes: number;
	catalogShow: CatalogShow | null;
}

// Android reads a stored value through a 2MB window (UTF-16, so ~1M chars): the whole catalog as
// one value (~2M chars) failed to load on every start ("Row too big to fit into CursorWindow"), so
// each show is its own value. A show this big is left unsaved rather than stored unreadable
const CATALOG_ENTRY_MAX_CHARS = 900_000;
// docId → JSON last written, so a persist only writes the shows that changed
const persistedCatalog = new Map<string, string>();

/** Persist catalog cache to AsyncStorage (skip null entries — they represent missing docs that may appear later) */
function persistCatalogCache(cache: Map<string, CatalogShow | null>) {
	const changed: Record<string, string> = {};
	const kept = new Set<string>();
	for (const [key, val] of cache) {
		if (val == null) continue;
		const json = JSON.stringify(val);
		if (json.length > CATALOG_ENTRY_MAX_CHARS) continue;
		kept.add(key);
		if (persistedCatalog.get(key) === json) continue;
		persistedCatalog.set(key, json);
		changed[CacheKey.CATALOG_SHOW + key] = json;
	}
	const dropped = [...persistedCatalog.keys()].filter((key) => !kept.has(key));
	for (const key of dropped) persistedCatalog.delete(key);
	if (Object.keys(changed).length === 0 && dropped.length === 0) return;
	changed[CacheKey.CATALOG_INDEX] = JSON.stringify([...kept]);
	AsyncStorage.setMany(changed).catch(() => {});
	if (dropped.length) AsyncStorage.removeMany(dropped.map((key) => CacheKey.CATALOG_SHOW + key)).catch(() => {});
}

/** Restore catalog cache from AsyncStorage */
async function restoreCatalogCache(): Promise<Map<string, CatalogShow | null>> {
	// The old single-value cache can't be read back on Android — free its ~2MB
	AsyncStorage.removeItem(CacheKey.CATALOG_CACHE).catch(() => {});
	const restored = new Map<string, CatalogShow | null>();
	try {
		const index = JSON.parse((await AsyncStorage.getItem(CacheKey.CATALOG_INDEX)) ?? "[]") as string[];
		if (index.length === 0) return restored;
		const rows = await AsyncStorage.getMany(index.map((key) => CacheKey.CATALOG_SHOW + key));
		for (const key of index) {
			const raw = rows[CacheKey.CATALOG_SHOW + key];
			if (!raw) continue;
			try {
				// Re-derive local air days (timezone may have changed since it was cached)
				restored.set(key, localizeCatalog(JSON.parse(raw) as CatalogShow));
				persistedCatalog.set(key, raw);
			} catch {}
		}
	} catch {}
	return restored;
}

// Shows re-read from Firestore this session for stale/missing display data (1 read max each)
const rereadThisSession = new Set<string>();
// Firestore attempts for missing/stand-in catalogs (CF may still be creating the doc)
const missingAttempts = new Map<string, number>();
const MAX_MISSING_ATTEMPTS = 3;

/** Firestore was tried for this show this session → TMDB heal is now allowed */
function backendTried(key: string): boolean {
	return rereadThisSession.has(key) || (missingAttempts.get(key) ?? 0) > 0;
}

async function enrichItems(
	trackingItems: TrackingItem[],
	cache: Map<string, CatalogShow | null>,
): Promise<EnrichedTrackingItem[]> {
	const db = getFirestore();
	let cacheUpdated = false;
	const enriched = await Promise.all(
		trackingItems.map(async (item): Promise<EnrichedTrackingItem> => {
			const mt = (item as any).mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			const key = showDocId(item.tmdbId, mt);
			let catalogShow: CatalogShow | null = cache.get(key) ?? null;

			const readFromFirestore = async () => {
				try {
					const showDoc = await getDoc(doc(db, "shows", key));
					if (showDoc?.exists?.()) {
						catalogShow = localizeCatalog({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow);
						cache.set(key, catalogShow);
						cacheUpdated = true;
					} else if (!catalogShow) {
						cache.set(key, null);
					}
				} catch {}
			};

			if (!catalogShow || isIncompleteCatalog(catalogShow)) {
				// Missing / stand-in → Firestore (CF may still be creating it; capped retries,
				// then TMDB heal takes over)
				const attempts = missingAttempts.get(key) ?? 0;
				if (attempts < MAX_MISSING_ATTEMPTS) {
					missingAttempts.set(key, attempts + 1);
					await readFromFirestore();
				}
			} else if (
				!rereadThisSession.has(key) &&
				hasMissingDisplayData({ ...item, mediaType: mt, catalogShow }, catalogShow)
			) {
				// Cache lacks poster / next-ep title / credits → Firestore once per session
				// (weekly sync may have it). TMDB heal only runs after this.
				rereadThisSession.add(key);
				await readFromFirestore();
			}

			return {
				...item,
				title: catalogShow?.title ?? (item as any).title ?? `Show #${item.tmdbId}`,
				posterPath: catalogShow?.posterPath ?? (item as any).posterPath ?? null,
				totalEpisodes: catalogShow?.totalEpisodes ?? 0,
				catalogShow: catalogShow ?? null,
				// Tracking docs hold the US air date; the catalog's TVMaze time gives the local day
				nextEpisodeAirDate: nextEpisodeLocalAirDate(item.nextEpisode, catalogShow, item.nextEpisodeAirDate),
			};
		}),
	);

	if (cacheUpdated) persistCatalogCache(cache);
	return enriched;
}

// Module-level catalog cache shared across hooks
// One map for the whole app lifetime — mutated in place, never reassigned
const sharedCatalogCache: Map<string, CatalogShow | null> = new Map();

let markCatalogRestored: () => void;
const catalogRestored = new Promise<void>((resolve) => (markCatalogRestored = resolve));

/** Resolves once the persisted catalog cache is back in memory (or after timeoutMs) */
export function whenCatalogRestored(timeoutMs = 3000): Promise<void> {
	return Promise.race([catalogRestored, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}

/** Put catalog docs fetched elsewhere (e.g. Watch History) into the shared cache + persist */
export function cacheCatalogShows(shows: CatalogShow[]) {
	if (shows.length === 0) return;
	for (const show of shows) sharedCatalogCache.set(showDocId(show.tmdbId, show.mediaType), show);
	persistCatalogCache(sharedCatalogCache);
}

/** Get a catalog show from the in-memory cache (no Firestore read) */
export function getCachedCatalogShow(tmdbId: number, mediaType: MediaType): CatalogShow | null {
	return sharedCatalogCache.get(showDocId(tmdbId, mediaType)) ?? null;
}

type CatalogPatchListener = (tmdbId: number, catalog: CatalogShow) => void;
const catalogPatchListeners = new Set<CatalogPatchListener>();

/**
 * Fresh TMDB season (episode info modal, show page dropdown) → patch the cached catalog when TMDB
 * changed titles / overviews / stills since the doc was written, persist that show, and tell every
 * useWatchlist instance so cards update now instead of after the next server sync. 0 reads/calls.
 */
export function healCatalogSeason(tmdbId: number, season: number, fresh: FreshSeasonEpisode[]) {
	const key = showDocId(tmdbId, MediaType.TV);
	const cached = sharedCatalogCache.get(key);
	if (!cached || isIncompleteCatalog(cached)) return;
	const patched = patchCatalogSeason(cached, season, fresh);
	if (!patched) return;
	sharedCatalogCache.set(key, patched);
	persistCatalogCache(sharedCatalogCache);
	for (const listener of catalogPatchListeners) listener(tmdbId, patched);
}

/**
 * Every successful TMDB season fetch lands in the show page's season images query (the info
 * modal's loadSeasonEpisodes shares the key) → heal from it. Also corrects the show page's
 * catalog-backed season query so its episode list matches.
 */
let seasonHealClient: QueryClient | null = null;
function subscribeSeasonHeal(queryClient: QueryClient) {
	// Once per client for the app's lifetime — keeps healing while Home is unmounted (web routes)
	if (seasonHealClient === queryClient) return;
	seasonHealClient = queryClient;
	queryClient.getQueryCache().subscribe((event) => {
		if (event.type !== "updated" || event.action.type !== "success") return;
		const [k, tmdbId, season] = event.query.queryKey as [unknown, unknown, unknown];
		if (k !== QueryKey.SEASON_IMAGES || typeof tmdbId !== "number" || typeof season !== "number")
			return;
		const fresh = (event.query.state.data as { episodes?: TMDBEpisode[] } | undefined)?.episodes;
		if (!fresh?.length) return;
		healCatalogSeason(tmdbId, season, fresh);
		const names = new Map(fresh.map((e) => [e.episode_number, e.name]));
		queryClient.setQueryData<{ fromCatalog?: boolean; episodes: TMDBEpisode[] }>(
			[QueryKey.SEASON, tmdbId, season],
			(prev) => {
				if (!prev?.fromCatalog) return prev;
				let changed = false;
				const episodes = prev.episodes.map((e) => {
					const name = names.get(e.episode_number)?.trim();
					const downgrade = isGenericEpisodeTitle(name) && !isGenericEpisodeTitle(e.name);
					if (!name || name === e.name || downgrade) return e;
					changed = true;
					return { ...e, name };
				});
				return changed ? { ...prev, episodes } : prev;
			},
		);
	});
}

// Tracking docs already corrected this session (itemId → name) — one write across hook instances
const healedTrackingNames = new Map<string, string>();

/** Item re-pointed at a patched catalog; its next-episode name follows the catalog's real title */
function withCatalog(item: EnrichedTrackingItem, catalog: CatalogShow): EnrichedTrackingItem {
	return {
		...item,
		catalogShow: catalog,
		nextEpisodeName: catalogNextEpisodeTitle(catalog, item.nextEpisode) ?? item.nextEpisodeName,
		nextEpisodeAirDate: nextEpisodeLocalAirDate(item.nextEpisode, catalog, item.nextEpisodeAirDate),
	};
}

function extractCredits(crew: any[] | undefined) {
	if (!crew) return { directors: [], writers: [], producers: [] };
	return {
		directors: crew.filter((c: any) => c.job === "Director").map((c: any) => c.name),
		writers: crew.filter((c: any) => c.department === "Writing").map((c: any) => c.name),
		producers: crew
			.filter((c: any) => c.job === "Producer")
			.map((c: any) => c.name)
			.slice(0, 3),
	};
}

/**
 * Build/refresh a catalog entry from TMDB.
 * With `base` + `onlySeasons`, only those seasons are re-fetched and merged into base.
 */
async function fetchCatalogFromTmdb(
	apiKey: string,
	tmdbId: number,
	mt: MediaType,
	base: CatalogShow | null,
	onlySeasons?: number[],
): Promise<CatalogShow | null> {
	const details: any = await getShowDetails(apiKey, tmdbId, mt);
	if (!details) return null;

	if (mt === MediaType.MOVIE) {
		const credits = extractCredits(details.credits?.crew);
		if (base) return { ...base, credits };
	}

	const seasonNumbers: number[] =
		mt === MediaType.TV
			? (details.seasons?.map((s: any) => s.season_number as number).filter((n: number) => n > 0) ??
				[])
			: [];
	const toFetch = onlySeasons
		? seasonNumbers.filter((n) => onlySeasons.includes(n))
		: seasonNumbers;
	const fetched = new Map<number, CatalogShow["seasons"][number]>();
	for (const sn of toFetch) {
		try {
			const sd: any = await getSeasonDetails(apiKey, tmdbId, sn);
			if (!sd?.episodes) continue;
			const eps = sd.episodes as any[];
			fetched.set(sn, {
				seasonNumber: sn,
				episodeCount: eps.length,
				airDate: sd.air_date ?? null,
				episodes: eps.map((e, idx) => ({
					episodeNumber: e.episode_number,
					title: e.name || "",
					overview: e.overview || "",
					airDate: e.air_date || null,
					runtime: e.runtime ?? null,
					stillPath: e.still_path || null,
					isSeasonFinale: idx === eps.length - 1,
				})),
			});
		} catch {}
	}

	let seasons: CatalogShow["seasons"];
	if (base && onlySeasons) {
		const merged = new Map((base.seasons ?? []).map((s) => [s.seasonNumber, s]));
		for (const [sn, s] of fetched) merged.set(sn, s);
		seasons = [...merged.values()].sort((a, b) => a.seasonNumber - b.seasonNumber);
	} else {
		seasons = [...fetched.values()];
	}

	return {
		...(base ?? {}),
		tmdbId,
		mediaType: mt,
		title: details.title || details.name || base?.title || "",
		posterPath: details.poster_path ?? base?.posterPath ?? null,
		backdropPath: details.backdrop_path ?? base?.backdropPath ?? null,
		overview: details.overview || base?.overview || "",
		status: details.status ?? base?.status ?? "",
		totalSeasons: mt === MediaType.TV ? seasons.length : 0,
		totalEpisodes:
			mt === MediaType.TV
				? seasons.reduce((sum, s) => sum + s.episodeCount, 0)
				: (details.number_of_episodes ?? 0),
		runtime: details.runtime ?? base?.runtime ?? null,
		voteAverage: details.vote_average ?? base?.voteAverage ?? 0,
		firstAirDate: details.first_air_date ?? base?.firstAirDate ?? null,
		releaseDate: details.release_date ?? base?.releaseDate ?? null,
		seasons,
		genres: details.genres?.map((g: any) => g.name).filter(Boolean) ?? base?.genres ?? [],
		...(mt === MediaType.MOVIE ? { credits: extractCredits(details.credits?.crew) } : {}),
		trackedBy: base?.trackedBy ?? [],
		trackedByCount: base?.trackedByCount ?? 0,
		lastSyncedAt: base?.lastSyncedAt ?? null,
		partial: false,
	};
}

export function useWatchlist(userId: string | undefined) {
	const [items, _setItems] = useState<EnrichedTrackingItem[]>([]);
	const setItems = useCallback(
		(
			update: EnrichedTrackingItem[] | ((prev: EnrichedTrackingItem[]) => EnrichedTrackingItem[]),
		) => {
			_setItems((prev) => {
				const next = typeof update === "function" ? update(prev) : update;
				itemsRef.current = new Map(next.map((i) => [i.id, i]));
				return next;
			});
		},
		[],
	);
	const [loading, setLoading] = useState(true);
	const [loadingMore, setLoadingMore] = useState(false);
	const [hasMore, setHasMore] = useState(true);
	const catalogCache = useRef<Map<string, CatalogShow | null>>(sharedCatalogCache);
	const catalogCacheRestored = useRef(false);
	const paginationCursor = useRef<QueryDocumentSnapshot | null>(null);
	const firstPageLastDoc = useRef<QueryDocumentSnapshot | null>(null);
	const paginatedItems = useRef<EnrichedTrackingItem[]>([]);
	// Queue snapshots received before catalog cache is restored
	const pendingSnapshot = useRef<any>(null);
	// Track current items for optimistic field preservation
	const itemsRef = useRef<Map<string, EnrichedTrackingItem>>(new Map());

	// Restore persisted catalog cache on mount
	useEffect(() => {
		restoreCatalogCache().then((restored) => {
			// Merge into the one shared map — never replace it. Other hook instances and
			// the history / calendar refresh hold the same map, and in-memory entries are
			// newer than the stored copy (e.g. freshly fetched logos)
			for (const [key, show] of restored) {
				if (!sharedCatalogCache.has(key)) sharedCatalogCache.set(key, show);
			}
			catalogCacheRestored.current = true;
			markCatalogRestored();
			// Process any snapshot that arrived while restoring
			if (pendingSnapshot.current) {
				pendingSnapshot.current();
				pendingSnapshot.current = null;
			}
		});
	}, []);

	// First page with real-time listener
	useEffect(() => {
		if (!userId) {
			setItems([]);
			setLoading(false);
			setHasMore(false);
			return;
		}

		const db = getFirestore();
		const colRef = collection(doc(db, "users", userId), "tracking");
		const q = query(colRef, orderBy("priorityDate", "desc"), limit(PAGE_SIZE));

		paginatedItems.current = [];
		paginationCursor.current = null;

		let prevEnrichedMap = new Map<string, EnrichedTrackingItem>();

		const unsubscribe = onSnapshot(
			q,
			async (snapshot) => {
				// Wait for catalog cache restoration before processing
				if (!catalogCacheRestored.current) {
					pendingSnapshot.current = () => processSnapshot(snapshot);
					return;
				}
				await processSnapshot(snapshot);
			},
			(error) => {
				console.error("Tracking listener error:", error);
				setLoading(false);
			},
		);

		async function processSnapshot(snapshot: any) {
			const trackingItems = snapshot.docs.map((d: any) => ({
				id: d.id,
				...d.data(),
			})) as TrackingItem[];

			// Only enrich changed/added items — reuse previous for unchanged
			const changedIds = new Set(snapshot.docChanges().map((c: any) => c.doc.id));
			const isInitial = prevEnrichedMap.size === 0;

			let enriched: EnrichedTrackingItem[];
			if (isInitial || changedIds.size === trackingItems.length) {
				// Initial load or full refresh
				enriched = await enrichItems(trackingItems, catalogCache.current);
			} else {
				// Incremental: only enrich changed items
				const toEnrich = trackingItems.filter((t) => changedIds.has(t.id));
				const freshlyEnriched = await enrichItems(toEnrich, catalogCache.current);
				const freshMap = new Map(freshlyEnriched.map((e) => [e.id, e]));

				// Unchanged docs keep the displayed item — it carries local catalog patches (TMDB heal,
				// season heal, sync re-read) the previous snapshot's copy doesn't
				enriched = trackingItems.map(
					(t) =>
						freshMap.get(t.id) ??
						itemsRef.current.get(t.id) ??
						prevEnrichedMap.get(t.id) ?? {
							...t,
							title: `Show #${t.tmdbId}`,
							posterPath: null,
							totalEpisodes: 0,
							catalogShow: null,
						},
				);
			}

			// Preserve optimistic catalogShow from emitShowAdded when listener
			// fires before CF creates the catalog doc
			for (let idx = 0; idx < enriched.length; idx++) {
				const e = enriched[idx];
				if (e.catalogShow) continue;
				const cur = itemsRef.current.get(e.id);
				if (!cur?.catalogShow) continue;
				enriched[idx] = {
					...e,
					catalogShow: cur.catalogShow,
					title: cur.title || e.title,
					posterPath: cur.posterPath ?? e.posterPath,
					totalEpisodes: cur.totalEpisodes || e.totalEpisodes,
				};
			}

			// Update prev map for next snapshot
			prevEnrichedMap = new Map(enriched.map((e) => [e.id, e]));

			firstPageLastDoc.current = snapshot.docs[snapshot.docs.length - 1] || null;
			if (!paginationCursor.current) {
				paginationCursor.current = firstPageLastDoc.current;
			}

			const firstPageIds = new Set(enriched.map((e) => e.id));
			paginatedItems.current = paginatedItems.current.filter((p) => !firstPageIds.has(p.id));

			// Removals in first page: filter paginated items locally (no Firestore reads)
			const removedIds = new Set(
				snapshot
					.docChanges()
					.filter((c: any) => c.type === DocChangeType.REMOVED)
					.map((c: any) => c.doc.id),
			);
			if (removedIds.size > 0) {
				paginatedItems.current = paginatedItems.current.filter((p) => !removedIds.has(p.id));
			}

			const merged = [...enriched, ...paginatedItems.current];
			setItems(merged);
			setHasMore(snapshot.docs.length >= PAGE_SIZE);
			setLoading(false);
		}

		return unsubscribe;
	}, [userId]);

	const loadMore = useCallback(async () => {
		if (!userId || !hasMore || loadingMore || !paginationCursor.current) return;
		setLoadingMore(true);

		try {
			const db = getFirestore();
			const colRef = collection(doc(db, "users", userId), "tracking");
			const q = query(
				colRef,
				orderBy("priorityDate", "desc"),
				startAfter(paginationCursor.current),
				limit(PAGE_SIZE),
			);

			const snapshot = await getDocs(q);
			if (snapshot.docs.length === 0) {
				setHasMore(false);
				return;
			}

			const trackingItems = snapshot.docs.map((d) => ({
				id: d.id,
				...d.data(),
			})) as TrackingItem[];

			const enriched = await enrichItems(trackingItems, catalogCache.current);

			paginationCursor.current = snapshot.docs[snapshot.docs.length - 1];

			const existingIds = new Set(paginatedItems.current.map((p) => p.id));
			const newItems = enriched.filter((e) => !existingIds.has(e.id));
			paginatedItems.current = [...paginatedItems.current, ...newItems];

			setItems((prev) => {
				const prevIds = new Set(prev.map((p) => p.id));
				const toAdd = newItems.filter((e) => !prevIds.has(e.id));
				return [...prev, ...toAdd];
			});

			setHasMore(snapshot.docs.length >= PAGE_SIZE);
		} catch (error) {
			console.error("Load more tracking error:", error);
		} finally {
			setLoadingMore(false);
		}
	}, [userId, hasMore, loadingMore]);

	const removeItem = useCallback((tmdbId: number) => {
		paginatedItems.current = paginatedItems.current.filter((p) => p.tmdbId !== tmdbId);
		// Keep catalog cache — shared metadata used by previously watched items
		setItems((prev) => prev.filter((p) => p.tmdbId !== tmdbId));
	}, []);

	const insertItem = useCallback((item: EnrichedTrackingItem) => {
		if (item.catalogShow) {
			const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			catalogCache.current.set(showDocId(item.tmdbId, mt), item.catalogShow);
			persistCatalogCache(catalogCache.current);
		}
		setItems((prev) => [item, ...prev.filter((p) => p.tmdbId !== item.tmdbId)]);
	}, []);

	// Fresh TMDB season loaded anywhere (info modal / show page) → cards follow the healed catalog
	const queryClient = useQueryClient();
	useEffect(() => subscribeSeasonHeal(queryClient), [queryClient]);
	useEffect(() => {
		const listener: CatalogPatchListener = (tmdbId, catalog) => {
			const patch = (p: EnrichedTrackingItem) =>
				p.tmdbId === tmdbId && p.mediaType !== MediaType.MOVIE ? withCatalog(p, catalog) : p;
			paginatedItems.current = paginatedItems.current.map(patch);
			// Tracking doc's stored name is stale too → same write as the TMDB heal (0 reads)
			if (userId) {
				for (const item of itemsRef.current.values()) {
					if (item.tmdbId !== tmdbId || item.mediaType === MediaType.MOVIE) continue;
					const name = catalogNextEpisodeTitle(catalog, item.nextEpisode);
					if (!name || name === item.nextEpisodeName || healedTrackingNames.get(item.id) === name)
						continue;
					healedTrackingNames.set(item.id, name);
					updateDoc(doc(getFirestore(), "users", userId, "tracking", item.id), {
						nextEpisodeName: name,
					}).catch(() => {});
				}
			}
			setItems((prev) => prev.map(patch));
		};
		catalogPatchListeners.add(listener);
		return () => {
			catalogPatchListeners.delete(listener);
		};
	}, [userId, setItems]);

	// Listen for external removal events (e.g. from ShowDetailScreen)
	useEffect(() => onShowRemoved(removeItem), [removeItem]);
	// Listen for external add events (e.g. from SearchScreen)
	useEffect(() => onShowAdded(insertItem), [insertItem]);

	// Weekly server catalog sync (config/app.lastCatalogSync) → re-read catalog docs for
	// tracked, still-airing shows once. Otherwise the AsyncStorage cache never sees new
	// episodes / air dates / posters.
	const lastCatalogSync = useAuthStore((s) => s.lastCatalogSync);
	const syncCheckDone = useRef<string | null>(null);
	useEffect(() => {
		if (!lastCatalogSync || loading || items.length === 0) return;
		if (syncCheckDone.current === lastCatalogSync) return;
		syncCheckDone.current = lastCatalogSync;
		(async () => {
			let stamp: string | null = null;
			try {
				stamp = await AsyncStorage.getItem(CacheKey.CATALOG_SYNC_STAMP);
			} catch {}
			if (stamp === lastCatalogSync) return;
			const persistStamp = () =>
				AsyncStorage.setItem(CacheKey.CATALOG_SYNC_STAMP, lastCatalogSync).catch(() => {});
			// No stamp yet (first run / pre-existing install) → refresh once too
			const db = getFirestore();
			const { previousCatalogSync, changedShowIds } = useAuthStore.getState();
			const stale = selectStaleCatalogItems(
				[...itemsRef.current.values()],
				stamp,
				previousCatalogSync,
				changedShowIds,
			);
			const updates = new Map<number, CatalogShow>();
			await Promise.all(
				stale.map(async (item) => {
					const key = showDocId(item.tmdbId, MediaType.TV);
					try {
						const snap = await getDoc(doc(db, "shows", key));
						if (!snap?.exists?.()) return;
						const fresh = localizeCatalog({ id: snap.id, ...snap.data() } as unknown as CatalogShow);
						catalogCache.current.set(key, fresh);
						updates.set(item.tmdbId, fresh);
					} catch {}
				}),
			);
			if (updates.size > 0) {
				persistCatalogCache(catalogCache.current);
				setItems((prev) =>
					prev.map((p) => {
						const c = updates.get(p.tmdbId);
						return c
							? {
									...p,
									catalogShow: c,
									nextEpisodeAirDate: nextEpisodeLocalAirDate(p.nextEpisode, c, p.nextEpisodeAirDate),
									title: c.title || p.title,
									posterPath: c.posterPath ?? p.posterPath,
									totalEpisodes: c.totalEpisodes ?? p.totalEpisodes,
								}
							: p;
					}),
				);
			}
			persistStamp();
		})();
	}, [lastCatalogSync, loading, items.length, setItems]);

	// Self-heal via TMDB (free — 0 Firestore reads):
	// - no catalog / search stand-in → build full catalog
	// - movie without credits → fetch credits
	// - TV missing poster or with placeholder next-episode name → refresh show + that season
	// Each show heals at most once per session.
	const healingRef = useRef(new Set<number>());
	const healedRef = useRef(new Set<number>());
	useEffect(() => {
		if (loading || items.length === 0) return;
		const needsHeal = (i: EnrichedTrackingItem) => {
			if (healingRef.current.has(i.tmdbId) || healedRef.current.has(i.tmdbId)) return false;
			const mt = i.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			return needsTmdbHeal(i, backendTried(showDocId(i.tmdbId, mt)));
		};
		const missing = items.filter(needsHeal);
		if (missing.length === 0) return;

		// Mark as healing to avoid duplicate fetches
		for (const m of missing) healingRef.current.add(m.tmdbId);

		const timer = setTimeout(async () => {
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			const updates: EnrichedTrackingItem[] = [];
			for (const item of missing) {
				const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
				const key = showDocId(item.tmdbId, mt);
				healingRef.current.delete(item.tmdbId);
				if (!apiKey) {
					if (item.catalogShow && mt === MediaType.MOVIE) {
						const emptyCredits = { directors: [], writers: [], producers: [] };
						const updatedCatalog = { ...item.catalogShow, credits: emptyCredits };
						catalogCache.current.set(key, updatedCatalog);
						updates.push({ ...item, catalogShow: updatedCatalog });
					}
					continue;
				}
				healedRef.current.add(item.tmdbId);
				try {
					const base =
						item.catalogShow && !isIncompleteCatalog(item.catalogShow) ? item.catalogShow : null;
					// Movie with catalog but missing credits → only credits
					// TV with catalog → only the next episode's season
					const onlySeasons =
						base && mt === MediaType.TV && item.nextEpisode ? [item.nextEpisode.season] : undefined;
					const catalog = await fetchCatalogFromTmdb(apiKey, item.tmdbId, mt, base, onlySeasons);
					if (!catalog) continue;
					catalogCache.current.set(key, catalog);

					// Tracking doc's stored next-episode name wins over catalog — fix placeholder there too
					let nextEpisodeName = item.nextEpisodeName ?? null;
					let nextEpisodeAirDate = item.nextEpisodeAirDate ?? null;
					const ne = item.nextEpisode;
					if (mt === MediaType.TV && ne && userId) {
						const ep = catalog.seasons
							?.find((s) => s.seasonNumber === ne.season)
							?.episodes?.find((e) => e.episodeNumber === ne.episode);
						const realName = ep?.title && !isGenericEpisodeTitle(ep.title) ? ep.title : null;
						const patch: Record<string, unknown> = {};
						if (realName && realName !== nextEpisodeName) patch.nextEpisodeName = realName;
						if (ep?.airDate && ep.airDate !== nextEpisodeAirDate)
							patch.nextEpisodeAirDate = ep.airDate;
						if (Object.keys(patch).length > 0) {
							nextEpisodeName = (patch.nextEpisodeName as string) ?? nextEpisodeName;
							nextEpisodeAirDate = (patch.nextEpisodeAirDate as string) ?? nextEpisodeAirDate;
							updateDoc(doc(getFirestore(), "users", userId, "tracking", item.id), patch).catch(
								() => {},
							);
						}
					}
					updates.push({
						...item,
						nextEpisodeName,
						nextEpisodeAirDate,
						title: catalog.title || item.title,
						posterPath: catalog.posterPath ?? item.posterPath,
						totalEpisodes: catalog.totalEpisodes ?? 0,
						catalogShow: catalog,
					});
				} catch {
					healedRef.current.delete(item.tmdbId);
				}
			}
			if (updates.length > 0) {
				persistCatalogCache(catalogCache.current);
				setItems((prev) => {
					const updateMap = new Map(updates.map((u) => [u.tmdbId, u]));
					return prev.map((p) => updateMap.get(p.tmdbId) ?? p);
				});
			}
		}, 3000);

		const healing = healingRef.current;
		return () => {
			clearTimeout(timer);
			for (const m of missing) healing.delete(m.tmdbId);
		};
	}, [loading, items, userId, setItems]);

	return { items, loading, loadMore, loadingMore, hasMore, removeItem };
}
