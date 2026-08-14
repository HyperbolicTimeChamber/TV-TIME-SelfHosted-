import { useEffect, useState, useRef, useCallback } from "react";
import { onShowRemoved, onShowAdded } from "../utils/watchlistEvents";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	getFirestore,
	collection,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	orderBy,
	limit,
	startAfter,
	QueryDocumentSnapshot,
} from "@react-native-firebase/firestore";
import { TrackingItem, CatalogShow, CacheKey, DocChangeType, MediaType } from "../types";
import { showDocId } from "../utils/docId";
import { useAuthStore } from "../stores";
import { getShowDetails, getSeasonDetails } from "../services/tmdb";

const PAGE_SIZE = 50;

export interface EnrichedTrackingItem extends TrackingItem {
	title: string;
	posterPath: string | null;
	totalEpisodes: number;
	catalogShow: CatalogShow | null;
}

/** Persist catalog cache to AsyncStorage (skip null entries — they represent missing docs that may appear later) */
function persistCatalogCache(cache: Map<string, CatalogShow | null>) {
	const obj: Record<string, CatalogShow> = {};
	for (const [key, val] of cache) {
		if (val != null) obj[key] = val;
	}
	AsyncStorage.setItem(CacheKey.CATALOG_CACHE, JSON.stringify(obj)).catch(() => {});
}

/** Restore catalog cache from AsyncStorage */
async function restoreCatalogCache(): Promise<Map<string, CatalogShow | null>> {
	try {
		const raw = await AsyncStorage.getItem(CacheKey.CATALOG_CACHE);
		if (!raw) return new Map();
		const obj = JSON.parse(raw) as Record<string, CatalogShow | null>;
		return new Map(Object.entries(obj));
	} catch {
		return new Map();
	}
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

			if (!catalogShow) {
				try {
					const showDoc = await getDoc(doc(db, "shows", key));
					catalogShow = showDoc?.exists?.()
						? ({ id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow)
						: null;
				} catch {
					catalogShow = null;
				}
				cache.set(key, catalogShow);
				cacheUpdated = true;
			} else if (mt === MediaType.TV && item.nextEpisode) {
				// Re-read from Firestore if cached catalog is missing episode data
				// for the current nextEpisode (stale AsyncStorage cache)
				const ne = item.nextEpisode;
				const season = catalogShow.seasons?.find((s) => s.seasonNumber === ne.season);
				const ep = season?.episodes?.find((e) => e.episodeNumber === ne.episode);
				if (!ep?.title) {
					try {
						const showDoc = await getDoc(doc(db, "shows", key));
						if (showDoc?.exists?.()) {
							catalogShow = { id: showDoc.id, ...showDoc.data() } as unknown as CatalogShow;
							cache.set(key, catalogShow);
							cacheUpdated = true;
						}
					} catch {}
				}
			}

			return {
				...item,
				title: catalogShow?.title ?? (item as any).title ?? `Show #${item.tmdbId}`,
				posterPath: catalogShow?.posterPath ?? (item as any).posterPath ?? null,
				totalEpisodes: catalogShow?.totalEpisodes ?? 0,
				catalogShow: catalogShow ?? null,
			};
		}),
	);

	if (cacheUpdated) persistCatalogCache(cache);
	return enriched;
}

// Module-level catalog cache shared across hooks
let sharedCatalogCache: Map<string, CatalogShow | null> = new Map();

/** Get a catalog show from the in-memory cache (no Firestore read) */
export function getCachedCatalogShow(tmdbId: number, mediaType: MediaType): CatalogShow | null {
	return sharedCatalogCache.get(showDocId(tmdbId, mediaType)) ?? null;
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
			if (restored.size > 0) {
				catalogCache.current = restored;
				sharedCatalogCache = restored;
			}
			catalogCacheRestored.current = true;
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

				enriched = trackingItems.map(
					(t) =>
						freshMap.get(t.id) ??
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
		// Update catalog cache if we have catalog data
		if (item.catalogShow) {
			const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			catalogCache.current.set(showDocId(item.tmdbId, mt), item.catalogShow);
			sharedCatalogCache = catalogCache.current;
			persistCatalogCache(catalogCache.current);
		}
		setItems((prev) => {
			// Don't duplicate
			if (prev.some((p) => p.tmdbId === item.tmdbId)) return prev;
			return [item, ...prev];
		});
	}, []);

	// Listen for external removal events (e.g. from ShowDetailScreen)
	useEffect(() => onShowRemoved(removeItem), [removeItem]);
	// Listen for external add events (e.g. from SearchScreen)
	useEffect(() => onShowAdded(insertItem), [insertItem]);

	// Self-heal: fetch from TMDB for items with null catalogShow (edge case —
	// CF hasn't created catalog doc yet). Uses TMDB API instead of Firestore.
	const healingRef = useRef(new Set<number>());
	useEffect(() => {
		if (loading || items.length === 0) return;
		const missing = items.filter(
			(i) =>
				!healingRef.current.has(i.tmdbId) &&
				(!i.catalogShow || (i.mediaType === MediaType.MOVIE && !i.catalogShow.credits)),
		);
		if (missing.length === 0) return;

		// Mark as healing to avoid duplicate fetches
		for (const m of missing) healingRef.current.add(m.tmdbId);

		const timer = setTimeout(async () => {
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			const updates: EnrichedTrackingItem[] = [];
			for (const item of missing) {
				const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
				const key = showDocId(item.tmdbId, mt);
				try {
					// Movie with catalog but missing credits → fetch via same axios path as search
					if (item.catalogShow && mt === MediaType.MOVIE) {
						const emptyCredits = { directors: [], writers: [], producers: [] };
						if (!apiKey) {
							const updatedCatalog = { ...item.catalogShow, credits: emptyCredits };
							catalogCache.current.set(key, updatedCatalog);
							updates.push({ ...item, catalogShow: updatedCatalog });
							healingRef.current.delete(item.tmdbId);
							continue;
						}
						const details = await getShowDetails(apiKey, item.tmdbId, MediaType.MOVIE);
						const crew = (details as any)?.credits?.crew;
						const credits = crew
							? {
									directors: crew.filter((c: any) => c.job === "Director").map((c: any) => c.name),
									writers: crew
										.filter((c: any) => c.department === "Writing")
										.map((c: any) => c.name),
									producers: crew
										.filter((c: any) => c.job === "Producer")
										.map((c: any) => c.name)
										.slice(0, 3),
								}
							: emptyCredits;
						const updatedCatalog = { ...item.catalogShow, credits };
						catalogCache.current.set(key, updatedCatalog);
						updates.push({ ...item, catalogShow: updatedCatalog });
						healingRef.current.delete(item.tmdbId);
						continue;
					}

					// Full heal for items with no catalogShow at all
					if (!apiKey) {
						healingRef.current.delete(item.tmdbId);
						continue;
					}
					const details = await getShowDetails(apiKey, item.tmdbId, mt);
					if (!details) continue;

					const genres: string[] =
						(details as any).genres?.map((g: any) => g.name).filter(Boolean) ?? [];
					const totalSeasons = (details as any).number_of_seasons ?? 0;
					const totalEpisodes = (details as any).number_of_episodes ?? 0;

					const seasons: CatalogShow["seasons"] = [];
					if (mt === MediaType.TV && totalSeasons > 0) {
						const seasonNumbers: number[] =
							(details as any).seasons
								?.map((s: any) => s.season_number as number)
								.filter((n: number) => n > 0) ?? [];
						for (const sn of seasonNumbers) {
							try {
								const sd = await getSeasonDetails(apiKey, item.tmdbId, sn);
								if (sd?.episodes) {
									const eps = sd.episodes;
									seasons.push({
										seasonNumber: sn,
										episodeCount: eps.length,
										airDate: (sd as any).air_date ?? null,
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
								}
							} catch {}
						}
					}

					const crew = (details as any).credits?.crew;
					const credits =
						mt === MediaType.MOVIE && crew
							? {
									directors: crew.filter((c: any) => c.job === "Director").map((c: any) => c.name),
									writers: crew
										.filter((c: any) => c.department === "Writing")
										.map((c: any) => c.name),
									producers: crew
										.filter((c: any) => c.job === "Producer")
										.map((c: any) => c.name)
										.slice(0, 3),
								}
							: undefined;

					const catalog: CatalogShow = {
						tmdbId: item.tmdbId,
						mediaType: mt,
						title: details.title || details.name || "",
						posterPath: details.poster_path ?? null,
						backdropPath: details.backdrop_path ?? null,
						overview: details.overview ?? "",
						status: (details as any).status ?? "",
						totalSeasons,
						totalEpisodes,
						runtime: (details as any).runtime ?? null,
						voteAverage: details.vote_average ?? 0,
						firstAirDate: details.first_air_date ?? null,
						releaseDate: details.release_date ?? null,
						seasons,
						genres,
						...(credits ? { credits } : {}),
						trackedBy: [],
						trackedByCount: 0,
						lastSyncedAt: null,
					};
					catalogCache.current.set(key, catalog);
					updates.push({
						...item,
						title: catalog.title || item.title,
						posterPath: catalog.posterPath ?? item.posterPath,
						totalEpisodes: catalog.totalEpisodes ?? 0,
						catalogShow: catalog,
					});
				} catch {}
				healingRef.current.delete(item.tmdbId);
			}
			if (updates.length > 0) {
				sharedCatalogCache = catalogCache.current;
				persistCatalogCache(catalogCache.current);
				setItems((prev) => {
					const updateMap = new Map(updates.map((u) => [u.tmdbId, u]));
					return prev.map((p) => updateMap.get(p.tmdbId) ?? p);
				});
			}
		}, 3000);

		return () => clearTimeout(timer);
	}, [loading, items]);

	return { items, loading, loadMore, loadingMore, hasMore, removeItem };
}
