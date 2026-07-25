import { useCallback, useEffect, useState, useRef } from "react";
import {
	getFirestore,
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { UpcomingEpisode, CacheKey, CloudFunction, MediaType } from "../types";
import { getCachedCatalogShow } from "./useWatchlist";

type MutateCallback = (fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) => void;
const mutateListeners = new Set<MutateCallback>();
const invalidateListeners = new Set<() => void>();

function mutateCachedEpisodes(fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) {
	mutateListeners.forEach((cb) => cb(fn));
}

function triggerInvalidate() {
	invalidateListeners.forEach((fn) => fn());
}

function todayStr() {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
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

	// Listen for invalidation (force refetch)
	useEffect(() => {
		const listener = () => setForceRefetch((t) => t + 1);
		invalidateListeners.add(listener);
		return () => {
			invalidateListeners.delete(listener);
		};
	}, []);

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
		AsyncStorage.getItem(CacheKey.UPCOMING_EPISODES).then((raw) => {
			if (!raw) {
				setCacheReady(true);
				return;
			}
			try {
				const cached = JSON.parse(raw);
				if (cached.userId === userId && cached.episodes?.length > 0) {
					const today = todayStr();
					const pruned = (cached.episodes as UpcomingEpisode[]).filter((ep) => ep.airDate >= today);
					cachedSyncDate.current = cached.syncDate || null;
					if (pruned.length > 0) {
						setEpisodes(pruned);
						setIsLoading(false);
						if (pruned.length !== cached.episodes.length) {
							persistCache(userId, pruned, cached.syncDate || "");
						}
					}
				}
			} catch {}
			setCacheReady(true);
		});
	}, [userId, cacheReady]);

	// Check if backend has synced since our cache → refetch if so
	useEffect(() => {
		if (!userId || !cacheReady) return;

		(async () => {
			// Read lastCatalogSync from config/app
			const db = getFirestore();
			try {
				const configDoc = await getDoc(doc(db, "config", "app"));
				const serverSync = configDoc.data()?.lastCatalogSync;
				const serverSyncStr = serverSync?.toDate?.()?.toISOString?.() || null;

				if (serverSyncStr && cachedSyncDate.current && serverSyncStr === cachedSyncDate.current) {
					// Cache is fresh — no refetch needed
					setIsLoading(false);
					return;
				}

				// Cache is stale or missing — fetch from Firestore
				if (episodes.length === 0) setIsLoading(true);
				setError(null);

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

				const eps = [...tvEps, ...movieEps].sort((a, b) => a.airDate.localeCompare(b.airDate));

				const newSyncDate = serverSyncStr || new Date().toISOString();
				cachedSyncDate.current = newSyncDate;
				setEpisodes(eps);
				setIsLoading(false);

				// Cache with sync date
				persistCache(userId, eps, newSyncDate);
			} catch (err) {
				console.error("Upcoming fetch error:", err);
				setError("Failed to fetch upcoming episodes");
				setIsLoading(false);
			}
		})();
	}, [userId, cacheReady, forceRefetch]);

	const retry = useCallback(() => setForceRefetch((t) => t + 1), []);

	return { data: episodes, isLoading, error, retry };
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
		invalidateUpcoming,
		mutateCachedUpcoming,
		rollbackUpcoming,
	};
}
