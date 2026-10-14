import { useCallback, useEffect, useState, useRef } from "react";
import {
	getFirestore,
	collection,
	doc,
	getDocs,
	query,
	where,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UpcomingEpisode, CacheKey, CloudFunction, MediaType } from "../types";
import { getCachedCatalogShow } from "./useWatchlist";
import {
	todayStr,
	trimPastQueue,
	upcomingEpKey as epKey,
	placeholderTargets,
	titlesFromCatalog,
	applyTitles,
	isGenericEpisodeTitle,
} from "../utils";
import { useAuthStore } from "../stores";
import { getSeasonDetails, pooled } from "../services/tmdb";

type MutateCallback = (fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) => void;
const mutateListeners = new Set<MutateCallback>();
const invalidateListeners = new Set<() => void>();
const pastRemoveListeners = new Set<(drop: (ep: UpcomingEpisode) => boolean) => void>();
// Mutations made while a Firestore fetch is in flight — replayed onto its result,
// otherwise the fetch (read before the mutation) puts e.g. a just-watched ep back
const inflightMutations = new Set<Array<(prev: UpcomingEpisode[]) => UpcomingEpisode[]>>();

function mutateCachedEpisodes(fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) {
	inflightMutations.forEach((pending) => pending.push(fn));
	mutateListeners.forEach((cb) => cb(fn));
}

function triggerInvalidate() {
	invalidateListeners.forEach((fn) => fn());
}

// --- Past days queue (local only, 0 Firestore reads) ---
// Episodes that drop off the upcoming list (airDate < today) are pushed into a
// per-device queue of the most recent PAST_DAYS_LIMIT air dates. Oldest date
// falls off when a new day is pushed past the limit.
async function loadPastQueue(userId: string): Promise<UpcomingEpisode[]> {
	try {
		const raw = await AsyncStorage.getItem(CacheKey.UPCOMING_PAST);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return parsed.userId === userId ? ((parsed.episodes as UpcomingEpisode[]) ?? []) : [];
	} catch {
		return [];
	}
}

function persistPastQueue(userId: string, episodes: UpcomingEpisode[]) {
	AsyncStorage.setItem(CacheKey.UPCOMING_PAST, JSON.stringify({ userId, episodes })).catch(
		() => {},
	);
}

/** Persist upcoming cache with mutations applied */
function persistCache(userId: string, episodes: UpcomingEpisode[], syncDate: string) {
	AsyncStorage.setItem(
		CacheKey.UPCOMING_EPISODES,
		JSON.stringify({ userId, syncDate, episodes }),
	).catch(() => {});
}

export function useUpcomingEpisodes(userId: string | undefined) {
	const [episodes, setEpisodes] = useState<UpcomingEpisode[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [forceRefetch, setForceRefetch] = useState(0);
	const [cacheReady, setCacheReady] = useState(false);
	const cachedSyncDate = useRef<string | null>(null);
	const [pastEpisodes, setPastEpisodes] = useState<UpcomingEpisode[]>([]);
	const pastRef = useRef<UpcomingEpisode[]>([]);

	/** Push episodes that have aired (airDate < today) into the past queue */
	const archivePast = useCallback(
		(eps: UpcomingEpisode[], base?: UpcomingEpisode[]) => {
			if (!userId) return;
			const today = todayStr();
			const prev = base ?? pastRef.current;
			const aired = eps.filter((ep) => ep.airDate < today);
			const next = trimPastQueue([...prev, ...aired], today);
			const changed =
				next.length !== prev.length || next.some((ep, i) => epKey(ep) !== epKey(prev[i]));
			pastRef.current = next;
			setPastEpisodes(next);
			if (changed) persistPastQueue(userId, next);
		},
		[userId],
	);

	// Listen for invalidation (force refetch)
	useEffect(() => {
		const listener = () => setForceRefetch((t) => t + 1);
		invalidateListeners.add(listener);
		return () => {
			invalidateListeners.delete(listener);
		};
	}, []);

	// Removed show / watched episode → drop it from the past queue too
	useEffect(() => {
		const cb = (drop: (ep: UpcomingEpisode) => boolean) => {
			const next = pastRef.current.filter((ep) => !drop(ep));
			if (next.length === pastRef.current.length) return;
			pastRef.current = next;
			setPastEpisodes(next);
			if (userId) persistPastQueue(userId, next);
		};
		pastRemoveListeners.add(cb);
		return () => {
			pastRemoveListeners.delete(cb);
		};
	}, [userId]);

	// Listen for direct mutations — update state AND persist to cache
	useEffect(() => {
		const cb: MutateCallback = (fn) =>
			setEpisodes((prev) => {
				const updated = fn(prev);
				if (userId && cachedSyncDate.current) {
					persistCache(userId, updated, cachedSyncDate.current);
				}
				return updated;
			});
		mutateListeners.add(cb);
		return () => {
			mutateListeners.delete(cb);
		};
	}, [userId]);

	// Restore from cache on mount + prune past episodes
	useEffect(() => {
		if (!userId || cacheReady) return;
		Promise.all([AsyncStorage.getItem(CacheKey.UPCOMING_EPISODES), loadPastQueue(userId)]).then(
			([raw, storedPast]) => {
				if (!raw) {
					archivePast([], storedPast);
					setCacheReady(true);
					return;
				}
				try {
					const cached = JSON.parse(raw);
					if (cached.userId === userId && cached.episodes?.length > 0) {
						const today = todayStr();
						// Aired since last open → push into past queue instead of dropping
						archivePast(cached.episodes as UpcomingEpisode[], storedPast);
						const pruned = (cached.episodes as UpcomingEpisode[]).filter(
							(ep) => ep.airDate >= today,
						);
						cachedSyncDate.current = cached.syncDate || null;
						if (pruned.length > 0) {
							setEpisodes(pruned);
							setIsLoading(false);
							if (pruned.length !== cached.episodes.length) {
								persistCache(userId, pruned, cached.syncDate || "");
							}
						}
					} else {
						archivePast([], storedPast);
					}
				} catch {}
				setCacheReady(true);
			},
		);
	}, [userId, cacheReady, archivePast]);

	// Wait for authStore's config/app load (provides lastCatalogSync)
	const configLoading = useAuthStore((s) => s.appTmdbApiKeyLoading);

	// Check if backend has synced since our cache → refetch if so
	useEffect(() => {
		if (!userId || !cacheReady || configLoading) return;

		(async () => {
			const pending: Array<(prev: UpcomingEpisode[]) => UpcomingEpisode[]> = [];
			// lastCatalogSync comes from authStore's config/app read — no extra read here
			const db = getFirestore();
			try {
				const serverSyncStr = useAuthStore.getState().lastCatalogSync;

				if (serverSyncStr && cachedSyncDate.current && serverSyncStr === cachedSyncDate.current) {
					// Cache is fresh — no refetch needed
					setIsLoading(false);
					return;
				}

				// Cache is stale or missing — fetch from Firestore
				if (episodes.length === 0) setIsLoading(true);
				setError(null);
				inflightMutations.add(pending);

				const today = todayStr();
				const upcomingCol = collection(doc(db, "users", userId), "upcoming");
				let snap = await getDocs(query(upcomingCol, where("airDate", ">=", today)));

				// If empty, rebuild upcoming subcollection via CF
				if (snap.size === 0) {
					try {
						await httpsCallable(getFunctions(), CloudFunction.REBUILD_UPCOMING)({});
						snap = await getDocs(query(upcomingCol, where("airDate", ">=", today)));
					} catch (err) {
						console.error("rebuildUpcoming CF failed:", err);
						setError("Failed to fetch upcoming episodes");
						setIsLoading(false);
						return;
					}
				}

				const tvEps: UpcomingEpisode[] = snap.docs.map((d) => d.data() as UpcomingEpisode);

				// Fetch tracked movies with future release dates
				// Query only docs that have releaseDate field set (avoids reading all 1000+ movies)
				const trackingCol = collection(doc(db, "users", userId), "tracking");
				const movieSnap = await getDocs(query(trackingCol, where("releaseDate", ">", today)));
				const movieEps: UpcomingEpisode[] = [];
				for (const d of movieSnap.docs) {
					const data = d.data() as any;
					if (data.mediaType !== "movie") continue; // skip TV shows that somehow have releaseDate
					// Use shared catalog cache — no Firestore read
					const catalog = getCachedCatalogShow(data.tmdbId, MediaType.MOVIE);
					const title = catalog?.title ?? `Movie #${data.tmdbId}`;
					const posterPath = catalog?.posterPath ?? null;
					movieEps.push({
						tmdbShowId: data.tmdbId,
						showTitle: title,
						posterPath,
						season: 0,
						episode: 0,
						episodeTitle: title,
						airDate: data.releaseDate,
						runtime: null,
						mediaType: MediaType.MOVIE,
					});
				}

				const fetched = [...tvEps, ...movieEps].sort((a, b) => a.airDate.localeCompare(b.airDate));
				const eps = pending.reduce((acc, fn) => fn(acc), fetched);

				const newSyncDate = serverSyncStr || new Date().toISOString();
				cachedSyncDate.current = newSyncDate;
				setEpisodes((prev) => {
					archivePast(prev);
					return eps;
				});
				setIsLoading(false);

				// Cache with sync date
				persistCache(userId, eps, newSyncDate);
			} catch (err) {
				console.error("Upcoming fetch error:", err);
				setError("Failed to fetch upcoming episodes");
				setIsLoading(false);
			} finally {
				inflightMutations.delete(pending);
			}
		})();
	}, [userId, cacheReady, configLoading, forceRefetch, archivePast]);

	const retry = useCallback(() => setForceRefetch((t) => t + 1), []);

	// App left open across midnight → move yesterday's episodes into the past queue
	const [today, setToday] = useState(todayStr);
	useEffect(() => {
		const id = setInterval(() => {
			const t = todayStr();
			if (t !== today) setToday(t);
		}, 60_000);
		return () => clearInterval(id);
	}, [today]);
	useEffect(() => {
		if (!userId || !cacheReady) return;
		if (!episodes.some((ep) => ep.airDate < today)) return;
		archivePast(episodes);
		setEpisodes((prev) => prev.filter((ep) => ep.airDate >= today));
	}, [today, userId, cacheReady, episodes, archivePast]);

	// Patch placeholder names ("Episode 1") with real TMDB titles — local only
	useEffect(() => {
		refreshPlaceholderTitles(
			[...pastRef.current, ...episodes],
			setEpisodes,
			(fn) => {
				const next = fn(pastRef.current);
				if (next === pastRef.current) return;
				pastRef.current = next;
				setPastEpisodes(next);
				if (userId) persistPastQueue(userId, next);
			},
			userId,
			cachedSyncDate.current,
		);
	}, [episodes, pastEpisodes, userId]);

	return { data: episodes, pastData: pastEpisodes, isLoading, error, retry };
}

// Show+season pairs already refreshed this session
const titleRefreshDone = new Set<string>();

/**
 * Upcoming docs are built weekly from the catalog, so episodes often carry TMDB
 * placeholder names ("Episode 1") while TMDB already has the real title. Fetch the
 * season from TMDB once per session and patch titles locally (+ persisted cache).
 */
async function refreshPlaceholderTitles(
	episodes: UpcomingEpisode[],
	setEpisodes: (fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) => void,
	mutatePast: (fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) => void,
	userId: string | undefined,
	syncDate: string | null,
) {
	if (!userId) return;
	const targets = placeholderTargets(episodes, titleRefreshDone);
	if (targets.size === 0) return;
	for (const k of targets.keys()) titleRefreshDone.add(k);

	// 1. Local catalog cache (healed/fresher than the weekly upcoming docs) — free
	// 2. Firestore skipped on purpose: upcoming docs are built from that same catalog doc
	// 3. TMDB for whatever is still a placeholder
	const titles = new Map<string, string>();
	const needTmdb: Array<{ tmdbId: number; season: number }> = [];
	for (const { tmdbId, season } of targets.values()) {
		const fromCache = titlesFromCatalog(getCachedCatalogShow(tmdbId, MediaType.TV), tmdbId, season);
		for (const [k, t] of fromCache) titles.set(k, t);
		const stillGeneric = episodes.some(
			(ep) =>
				ep.tmdbShowId === tmdbId &&
				ep.season === season &&
				isGenericEpisodeTitle(ep.episodeTitle) &&
				!fromCache.has(epKey(ep)),
		);
		if (stillGeneric) needTmdb.push({ tmdbId, season });
	}

	const apiKey = useAuthStore.getState().appTmdbApiKey;
	if (apiKey && needTmdb.length > 0) {
		await pooled(
			needTmdb.map(({ tmdbId, season }) => async () => {
				try {
					const sd = await getSeasonDetails(apiKey, tmdbId, season);
					for (const e of sd.episodes ?? []) {
						if (!isGenericEpisodeTitle(e.name)) {
							titles.set(epKey({ tmdbShowId: tmdbId, season, episode: e.episode_number }), e.name);
						}
					}
				} catch {}
			}),
			3,
		);
	}
	if (titles.size === 0) return;
	setEpisodes((prev) => {
		const next = applyTitles(prev, titles);
		if (next !== prev && syncDate) persistCache(userId, next, syncDate);
		return next;
	});
	mutatePast((prev) => applyTitles(prev, titles));
}

// Snapshot holder for optimistic rollbacks
let _lastSnapshot: UpcomingEpisode[] | null = null;

export function useUpcomingMutations() {
	/** Add items to upcoming cache locally. Accepts single item or array. */
	const addShowToUpcoming = useCallback(
		(tmdbId: number, items?: UpcomingEpisode | UpcomingEpisode[]) => {
			if (!items) return;
			const toAdd = Array.isArray(items) ? items : [items];
			if (toAdd.length === 0) return;
			mutateCachedEpisodes((prev) => {
				const existing = new Set(prev.map((ep) => `${ep.tmdbShowId}_${ep.season}_${ep.episode}`));
				const newItems = toAdd.filter(
					(item) => !existing.has(`${item.tmdbShowId}_${item.season}_${item.episode}`),
				);
				if (newItems.length === 0) return prev;
				return [...prev, ...newItems].sort((a, b) => a.airDate.localeCompare(b.airDate));
			});
		},
		[],
	);

	const removeShowFromUpcoming = useCallback((tmdbId: number) => {
		// Optimistic: remove from local state + cache immediately
		mutateCachedEpisodes((prev) => prev.filter((ep) => ep.tmdbShowId !== tmdbId));
		pastRemoveListeners.forEach((fn) => fn((ep) => ep.tmdbShowId === tmdbId));
	}, []);

	/** Watched episode → out of the past-days queue (upcoming list is filtered optimistically) */
	const removeWatchedFromPast = useCallback((tmdbId: number, season: number, episode: number) => {
		pastRemoveListeners.forEach((fn) =>
			fn((ep) => ep.tmdbShowId === tmdbId && ep.season === season && ep.episode === episode),
		);
	}, []);

	const invalidateUpcoming = useCallback(() => {
		triggerInvalidate();
	}, []);

	/** Optimistic mutation with snapshot for rollback. Returns prev state. */
	const mutateCachedUpcoming = useCallback(
		(fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]): UpcomingEpisode[] => {
			let snapshot: UpcomingEpisode[] = [];
			mutateCachedEpisodes((prev) => {
				snapshot = prev;
				_lastSnapshot = prev;
				return fn(prev);
			});
			return snapshot;
		},
		[],
	);

	/** Rollback to a previous snapshot */
	const rollbackUpcoming = useCallback((snapshot: UpcomingEpisode[]) => {
		mutateCachedEpisodes(() => snapshot);
	}, []);

	return {
		addShowToUpcoming,
		removeShowFromUpcoming,
		removeWatchedFromPast,
		invalidateUpcoming,
		mutateCachedUpcoming,
		rollbackUpcoming,
	};
}
