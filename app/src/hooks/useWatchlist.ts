import { useEffect, useState, useRef, useCallback } from "react";
import {
	onShowRemoved,
	onShowPaused,
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
	needsServerRefresh,
	freshSeasonAddsEpisodes,
	isNewerServerCatalog,
	todayStr,
	type FreshSeasonEpisode,
} from "../utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore, doc, getDoc, updateDoc } from "@react-native-firebase/firestore";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
	TrackingItem,
	CatalogShow,
	CacheKey,
	MediaType,
	QueryKey,
	type RegionWatchProviders,
	type TMDBEpisode,
} from "../types";
import { EpisodeType, RefreshReason } from "../enums";
import {
	subscribeTracking,
	loadMoreTracking,
	removeTrackingLocal,
	upsertTrackingLocal,
	type TrackingDoc,
} from "./trackingStore";
import { useAuthStore } from "../stores";
import { fetchCatalogDocs } from "../services/historyApi";
import { getShowDetails, getSeasonDetails } from "../services/tmdb";
import {
	requestShowRefresh,
	requestCatalogCreate,
	awaitCatalogCreate,
} from "../services/refreshShow";

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
	if (dropped.length)
		AsyncStorage.removeMany(dropped.map((key) => CacheKey.CATALOG_SHOW + key)).catch(() => {});
}

/** Restore catalog cache from AsyncStorage */
async function restoreCatalogCache(): Promise<Map<string, CatalogShow | null>> {
	// The old single-value cache can't be read back on Android — free its ~2MB
	AsyncStorage.removeItem(CacheKey.CATALOG_CACHE).catch(() => {});
	const restored = new Map<string, CatalogShow | null>();
	try {
		const index = JSON.parse(
			(await AsyncStorage.getItem(CacheKey.CATALOG_INDEX)) ?? "[]",
		) as string[];
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
	let cacheUpdated = false;
	// Pass 1: cache + add-time fills; collect the docs still missing / stand-in
	const resolved = await Promise.all(
		trackingItems.map(async (item) => {
			const mt = (item as any).mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			const key = showDocId(item.tmdbId, mt);
			let catalogShow: CatalogShow | null = cache.get(key) ?? null;
			// Background fill started at add time (search) → use its result instead of a doc read
			const filling = catalogFills.get(key);
			if (filling && (!catalogShow || isIncompleteCatalog(catalogShow))) {
				catalogShow = (await filling) ?? catalogShow;
			}
			return { item, key, catalogShow };
		}),
	);

	// Missing / stand-in → Firestore (CF may still be creating it; capped retries, then the
	// server heal takes over). One `in` query per 30 shows, not a getDoc each (see fetchCatalogDocs)
	const toRead = resolved.filter(({ key, catalogShow }) => {
		if (catalogShow && !isIncompleteCatalog(catalogShow)) return false;
		const attempts = missingAttempts.get(key) ?? 0;
		if (attempts >= MAX_MISSING_ATTEMPTS) return false;
		missingAttempts.set(key, attempts + 1);
		return true;
	});
	if (toRead.length > 0) {
		try {
			const fetched = await fetchCatalogDocs(toRead.map((r) => r.key));
			for (const r of toRead) {
				const fresh = fetched.get(r.key);
				if (fresh) {
					r.catalogShow = fresh;
					cache.set(r.key, fresh);
					cacheUpdated = true;
				} else if (!r.catalogShow) {
					cache.set(r.key, null);
				}
			}
		} catch {}
	}
	// Poster / next-ep title / credits missing: not here — healShown fixes a card once the
	// user actually sees it (a re-read for every list card cost reads nobody looked at)

	const enriched = resolved.map(({ item, catalogShow }): EnrichedTrackingItem => ({
		...item,
		title: catalogShow?.title ?? (item as any).title ?? `Show #${item.tmdbId}`,
		posterPath: catalogShow?.posterPath ?? (item as any).posterPath ?? null,
		totalEpisodes: catalogShow?.totalEpisodes ?? 0,
		catalogShow: catalogShow ?? null,
		// Tracking docs hold the US air date; the catalog's TVMaze time gives the local day
		nextEpisodeAirDate: nextEpisodeLocalAirDate(
			item.nextEpisode,
			catalogShow,
			item.nextEpisodeAirDate,
		),
	}));

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

/** Titles in the in-memory catalog cache — shows this device has tracked or opened */
export function getCachedCatalogTitles(): string[] {
	const titles: string[] = [];
	for (const show of sharedCatalogCache.values()) if (show?.title) titles.push(show.title);
	return titles;
}

/** Cached entry already has everything the cards / show page show → nothing to fill */
function isCompleteCatalog(c: CatalogShow | null | undefined, mt: MediaType): c is CatalogShow {
	if (!c || isIncompleteCatalog(c)) return false;
	return mt === MediaType.MOVIE ? !!c.credits : (c.seasons?.length ?? 0) > 0;
}

// In-flight background fills (docId → full catalog) — one build per title at a time
const catalogFills = new Map<string, Promise<CatalogShow | null>>();
type CatalogFillListener = (catalog: CatalogShow) => void;
const catalogFillListeners = new Set<CatalogFillListener>();

/** Full catalog for a just-added title: built once on the server, TMDB from here only as a last resort */
async function buildFilledCatalog(
	tmdbId: number,
	mediaType: MediaType,
	cached: CatalogShow | null | undefined,
): Promise<CatalogShow | null> {
	// The add's own addShow call returns the shared doc (existing, or created from TMDB there)
	const created = await awaitCatalogCreate(tmdbId, mediaType);
	let server = created ? localizeCatalog(created) : null;
	// Doc exists but lacks credits / seasons → shared refresh (server cooldown dedupes users)
	if (server && !isCompleteCatalog(server, mediaType)) {
		const refreshed = await requestShowRefresh(tmdbId, mediaType, RefreshReason.MISSING_DATA);
		if (refreshed) server = localizeCatalog(refreshed);
	}
	if (isCompleteCatalog(server, mediaType)) return server;
	// Callable failed / not deployed / offline → this client's TMDB build (same as the old heal)
	const apiKey = useAuthStore.getState().appTmdbApiKey;
	if (!apiKey) return server;
	const base = [server, cached].find((c) => c && !isIncompleteCatalog(c)) ?? null;
	return (await fetchCatalogFromTmdb(apiKey, tmdbId, mediaType, base).catch(() => null)) ?? server;
}

/**
 * Title added / marked from search → get its full catalog in the background right away instead
 * of when the Watch List heals it. Uses the add's addShow response (0 extra calls), then the
 * shared refreshShow if the doc is incomplete. Deduped; lands in the shared cache (the show page
 * reuses it) and patches mounted watchlists. 0 Firestore reads.
 */
export function prefillCatalog(tmdbId: number, mediaType: MediaType): Promise<CatalogShow | null> {
	const key = showDocId(tmdbId, mediaType);
	const cached = sharedCatalogCache.get(key);
	if (isCompleteCatalog(cached, mediaType)) return Promise.resolve(cached);
	const inFlight = catalogFills.get(key);
	if (inFlight) return inFlight;
	const fill = buildFilledCatalog(tmdbId, mediaType, cached)
		.then((catalog) => {
			// A complete doc that arrived meanwhile (sync / enrich read) wins
			const now = sharedCatalogCache.get(key);
			if (isCompleteCatalog(now, mediaType)) return now;
			if (!catalog || isIncompleteCatalog(catalog)) return null;
			sharedCatalogCache.set(key, catalog);
			persistCatalogCache(sharedCatalogCache);
			for (const listener of catalogFillListeners) listener(catalog);
			return catalog;
		})
		.catch(() => null)
		.finally(() => catalogFills.delete(key));
	catalogFills.set(key, fill);
	return fill;
}

/**
 * A country's Where to Watch the watchProviders CF just stored → onto the cached catalog doc too,
 * so the next visit reads it from the cache (no CF call). Nothing else on the doc changed, so
 * the watchlist isn't told
 */
export function cacheWatchProviders(
	tmdbId: number,
	mediaType: MediaType,
	region: string,
	value: RegionWatchProviders,
) {
	const key = showDocId(tmdbId, mediaType);
	const cached = sharedCatalogCache.get(key);
	if (!cached) return;
	sharedCatalogCache.set(key, {
		...cached,
		watchProviders: { ...cached.watchProviders, [region]: value },
	});
	persistCatalogCache(sharedCatalogCache);
}

type CatalogPatchListener = (catalog: CatalogShow) => void;
const catalogPatchListeners = new Set<CatalogPatchListener>();

/** Cache + persist one patched/fresh catalog and tell every useWatchlist instance (cards follow) */
function publishCatalog(catalog: CatalogShow) {
	sharedCatalogCache.set(showDocId(catalog.tmdbId, catalog.mediaType), catalog);
	persistCatalogCache(sharedCatalogCache);
	for (const listener of catalogPatchListeners) listener(catalog);
}

/**
 * Shared server refresh (refreshShow CF) → the returned doc replaces the cached one only when
 * someone refreshed it after our copy was read. Fire-and-forget; deduped per session.
 */
function refreshShared(
	tmdbId: number,
	mediaType: MediaType,
	reason: RefreshReason,
	seasons?: number[],
) {
	requestShowRefresh(tmdbId, mediaType, reason, seasons).then((server) => {
		if (!server) return;
		const cached = sharedCatalogCache.get(showDocId(tmdbId, mediaType));
		if (isNewerServerCatalog(server, cached)) publishCatalog(localizeCatalog(server));
	});
}

// Shows asked for an aired-without-finale refresh this session (across hook instances)
const airedRefreshAsked = new Set<string>();

/**
 * Fresh TMDB season (episode info modal, show page dropdown) → patch the cached catalog when TMDB
 * changed titles / overviews / stills / episode types since the doc was written, persist that
 * show, and tell every useWatchlist instance so cards update now (0 reads/calls). The catalog doc
 * is proven stale then (or TMDB lists episodes it lacks) → one shared server refresh so the fix
 * reaches every user, not just this cache.
 */
export function healCatalogSeason(tmdbId: number, season: number, fresh: FreshSeasonEpisode[]) {
	const key = showDocId(tmdbId, MediaType.TV);
	const cached = sharedCatalogCache.get(key);
	if (!cached || isIncompleteCatalog(cached)) return;
	const patched = patchCatalogSeason(cached, season, fresh);
	if (patched) publishCatalog(patched);
	if (patched || freshSeasonAddsEpisodes(cached, season, fresh)) {
		refreshShared(tmdbId, MediaType.TV, RefreshReason.STALE_SEASON, [season]);
	}
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
		title: catalog.title || item.title,
		posterPath: catalog.posterPath ?? item.posterPath,
		totalEpisodes: catalog.totalEpisodes ?? item.totalEpisodes,
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
				episodes: eps.map((e) => ({
					episodeNumber: e.episode_number,
					title: e.name || "",
					overview: e.overview || "",
					airDate: e.air_date || null,
					runtime: e.runtime ?? null,
					stillPath: e.still_path || null,
					// TMDB's explicit marker only — the last listed episode may just be the latest
					...(e.episode_type ? { episodeType: e.episode_type } : {}),
					isSeasonFinale: e.episode_type === EpisodeType.FINALE,
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
	// Queue a store update received before catalog cache is restored
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

	// Tracking docs from the delta-synced store (saved pages, then only what changed). Each
	// store update re-enriches only the docs that changed; the rest keep their displayed item —
	// it carries local catalog patches (TMDB heal, season heal, sync re-read)
	useEffect(() => {
		if (!userId) {
			setItems([]);
			setLoading(false);
			setHasMore(false);
			return;
		}
		// Docs of the last applied update — only the ones that differ get enriched again
		let prevDocs = new Map<string, TrackingDoc>();
		// Only the newest store state may apply (enrichment is async)
		let version = 0;

		const unsubscribe = subscribeTracking(userId, (state) => {
			setHasMore(state.hasMore);
			setLoadingMore(state.loadingMore);
			if (state.loading) return;
			const v = ++version;
			const process = async () => {
				const changed = state.docs.filter((d) => prevDocs.get(d.id) !== d);
				const fresh = changed.length > 0 ? await enrichItems(changed, catalogCache.current) : [];
				if (v !== version) return;
				const freshMap = new Map(fresh.map((e) => [e.id, e]));
				prevDocs = new Map(state.docs.map((d) => [d.id, d]));
				// Merged against the latest applied items (not itemsRef — it only follows once React
				// runs this updater, so an update right behind another put the older item back)
				setItems((prev) => {
					const current = new Map(prev.map((p) => [p.id, p]));
					return state.docs.map((d): EnrichedTrackingItem => {
						const cur = current.get(d.id);
						const e = freshMap.get(d.id) ?? cur;
						if (!e) {
							return {
								...d,
								title: `Show #${d.tmdbId}`,
								posterPath: null,
								totalEpisodes: 0,
								catalogShow: null,
							};
						}
						// Preserve optimistic catalogShow from emitShowAdded when the doc arrives
						// before the CF creates the catalog doc
						if (e.catalogShow || !cur?.catalogShow) return e;
						return {
							...e,
							catalogShow: cur.catalogShow,
							title: cur.title || e.title,
							posterPath: cur.posterPath ?? e.posterPath,
							totalEpisodes: cur.totalEpisodes || e.totalEpisodes,
						};
					});
				});
				setLoading(false);
			};
			// Wait for catalog cache restoration before enriching
			if (!catalogCacheRestored.current) pendingSnapshot.current = process;
			else process();
		});
		return unsubscribe;
	}, [userId, setItems]);

	const loadMore = useCallback(async () => {
		if (!userId) return;
		await loadMoreTracking(userId);
	}, [userId]);

	const removeItem = useCallback(
		(tmdbId: number) => {
			// Keep catalog cache — shared metadata used by previously watched items
			setItems((prev) => prev.filter((p) => p.tmdbId !== tmdbId));
			if (userId) removeTrackingLocal(userId, tmdbId);
		},
		[userId, setItems],
	);

	const insertItem = useCallback(
		(added: EnrichedTrackingItem) => {
			let item = added;
			const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			const key = showDocId(item.tmdbId, mt);
			const cached = catalogCache.current.get(key);
			if (
				(!item.catalogShow || isIncompleteCatalog(item.catalogShow)) &&
				isCompleteCatalog(cached, mt)
			) {
				// Background fill already landed — a stand-in / missing catalog mustn't replace it
				item = { ...item, catalogShow: cached };
			} else if (item.catalogShow) {
				catalogCache.current.set(key, item.catalogShow);
				persistCatalogCache(catalogCache.current);
			}
			setItems((prev) => [item, ...prev.filter((p) => p.tmdbId !== item.tmdbId)]);
			// Saved docs hold the tracking fields only (the catalog has its own cache)
			if (userId) {
				const { catalogShow: _catalogShow, totalEpisodes: _totalEpisodes, ...tracking } = item;
				upsertTrackingLocal(userId, tracking as TrackingDoc);
			}
		},
		[userId, setItems],
	);

	// Fresh TMDB season loaded anywhere (info modal / show page) → cards follow the healed catalog
	const queryClient = useQueryClient();
	useEffect(() => subscribeSeasonHeal(queryClient), [queryClient]);
	useEffect(() => {
		const listener: CatalogPatchListener = (catalog) => {
			const { tmdbId } = catalog;
			const isMovie = catalog.mediaType === MediaType.MOVIE;
			const patch = (p: EnrichedTrackingItem) =>
				p.tmdbId === tmdbId && (p.mediaType === MediaType.MOVIE) === isMovie
					? withCatalog(p, catalog)
					: p;
			// Tracking doc's stored name is stale too → one write per item (0 reads)
			if (userId && !isMovie) {
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
	// Paused elsewhere (ShowDetailScreen): off the watchlist, still tracked
	useEffect(() => onShowPaused(removeItem), [removeItem]);
	// Listen for external add events (e.g. from SearchScreen)
	useEffect(() => onShowAdded(insertItem), [insertItem]);
	// Background catalog fill landed → cards still on no / stand-in catalog follow it
	useEffect(() => {
		const listener: CatalogFillListener = (catalog) => {
			const mt = catalog.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			const patch = (p: EnrichedTrackingItem) => {
				const pmt = p.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
				if (p.tmdbId !== catalog.tmdbId || pmt !== mt || isCompleteCatalog(p.catalogShow, mt))
					return p;
				return {
					...(mt === MediaType.TV ? withCatalog(p, catalog) : { ...p, catalogShow: catalog }),
					title: catalog.title || p.title,
					posterPath: catalog.posterPath ?? p.posterPath,
					totalEpisodes: catalog.totalEpisodes || p.totalEpisodes,
				};
			};
			setItems((prev) => prev.map(patch));
		};
		catalogFillListeners.add(listener);
		return () => {
			catalogFillListeners.delete(listener);
		};
	}, [setItems]);

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
			const { previousCatalogSync, changedShowIds } = useAuthStore.getState();
			const stale = selectStaleCatalogItems(
				[...itemsRef.current.values()],
				stamp,
				previousCatalogSync,
				changedShowIds,
			);
			const updates = new Map<number, CatalogShow>();
			if (stale.length > 0) {
				// One `in` query per 30 shows, not a getDoc each (see fetchCatalogDocs)
				const keyOf = (tmdbId: number) => showDocId(tmdbId, MediaType.TV);
				try {
					const fetched = await fetchCatalogDocs(stale.map((s) => keyOf(s.tmdbId)));
					for (const item of stale) {
						const key = keyOf(item.tmdbId);
						const fresh = fetched.get(key);
						if (!fresh) continue;
						catalogCache.current.set(key, fresh);
						updates.set(item.tmdbId, fresh);
					}
				} catch {}
			}
			if (updates.size > 0) {
				persistCatalogCache(catalogCache.current);
				setItems((prev) =>
					prev.map((p) => {
						const c = updates.get(p.tmdbId);
						return c
							? {
									...p,
									catalogShow: c,
									nextEpisodeAirDate: nextEpisodeLocalAirDate(
										p.nextEpisode,
										c,
										p.nextEpisodeAirDate,
									),
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

	// Self-heal, only for cards the user has on screen (healShown — the list calls it once a card
	// has stayed in view): nothing is fixed for titles nobody is looking at. Per show, at most
	// once a session, cheapest first:
	// - no catalog doc after the Firestore retries → addShow builds it from TMDB
	// - poster / aired next-episode name / movie credits missing → one Firestore re-read (the
	//   weekly sync may have it), then refreshShow (shared TMDB refresh, next season included)
	// - last listed episode aired without TMDB's finale marker → refreshShow (TMDB may list
	//   the next episodes already); server cooldowns answer repeats with the doc
	// Results arrive via publishCatalog → listener.
	const shownItemsRef = useRef(items);
	shownItemsRef.current = items;
	const shownRef = useRef(new Set<string>());
	const healShown = useCallback((tmdbIds: number[]) => {
		for (const tmdbId of tmdbIds) {
			const item = shownItemsRef.current.find((i) => i.tmdbId === tmdbId);
			if (!item) continue;
			const mt = item.mediaType === MediaType.MOVIE ? MediaType.MOVIE : MediaType.TV;
			const key = showDocId(item.tmdbId, mt);
			if (shownRef.current.has(key)) continue;
			shownRef.current.add(key);
			healCard(item, mt, key).catch(() => {});
		}
	}, []);

	return { items, loading, loadMore, loadingMore, hasMore, removeItem, healShown };
}

/** One on-screen card's heal (see healShown) */
async function healCard(item: EnrichedTrackingItem, mt: MediaType, key: string) {
	let catalog = sharedCatalogCache.get(key) ?? item.catalogShow;
	if (!catalog || isIncompleteCatalog(catalog)) {
		if (!backendTried(key)) return;
		const created = await requestCatalogCreate(item.tmdbId, mt);
		if (created) publishCatalog(localizeCatalog(created));
		return;
	}
	const display = { ...item, mediaType: mt, catalogShow: catalog };
	if (hasMissingDisplayData(display, catalog)) {
		if (!rereadThisSession.has(key)) {
			rereadThisSession.add(key);
			const snap = await getDoc(doc(getFirestore(), "shows", key)).catch(() => null);
			if (snap?.exists?.()) {
				const fresh = localizeCatalog({ id: snap.id, ...snap.data() } as unknown as CatalogShow);
				publishCatalog(fresh);
				catalog = fresh;
			}
		}
		if (needsTmdbHeal({ ...display, catalogShow: catalog }, true)) {
			const seasons =
				mt === MediaType.TV && item.nextEpisode ? [item.nextEpisode.season] : undefined;
			refreshShared(item.tmdbId, mt, RefreshReason.MISSING_DATA, seasons);
			return;
		}
	}
	if (
		mt === MediaType.TV &&
		!airedRefreshAsked.has(key) &&
		needsServerRefresh(catalog, todayStr(), Date.now())
	) {
		airedRefreshAsked.add(key);
		refreshShared(item.tmdbId, MediaType.TV, RefreshReason.AIRED_NO_FINALE);
	}
}
