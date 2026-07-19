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
import { UpcomingEpisode, CacheKey, MediaType } from "../types";
import { getCatalogShow } from "../services";

type MutateCallback = (
  fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[],
) => void;
const mutateListeners = new Set<MutateCallback>();
const invalidateListeners = new Set<() => void>();

function mutateCachedEpisodes(
  fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[],
) {
  mutateListeners.forEach((cb) => cb(fn));
}

function triggerInvalidate() {
  invalidateListeners.forEach((fn) => fn());
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
  const cacheRestored = useRef(false);
  const cachedSyncDate = useRef<string | null>(null);

  // Listen for invalidation (force refetch)
  useEffect(() => {
    const listener = () => setForceRefetch((t) => t + 1);
    invalidateListeners.add(listener);
    return () => { invalidateListeners.delete(listener); };
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
    return () => { mutateListeners.delete(cb); };
  }, [userId]);

  // Restore from cache on mount + prune past episodes
  useEffect(() => {
    if (!userId || cacheRestored.current) return;
    AsyncStorage.getItem(CacheKey.UPCOMING_EPISODES).then((raw) => {
      if (!raw) {
        cacheRestored.current = true;
        return;
      }
      try {
        const cached = JSON.parse(raw);
        if (cached.userId === userId && cached.episodes?.length > 0) {
          const today = todayStr();
          // Prune episodes/movies from past days
          const pruned = (cached.episodes as UpcomingEpisode[]).filter(
            (ep) => ep.airDate >= today,
          );
          cachedSyncDate.current = cached.syncDate || null;
          if (pruned.length > 0) {
            setEpisodes(pruned);
            setIsLoading(false);
            // Persist pruned version
            if (pruned.length !== cached.episodes.length) {
              persistCache(userId, pruned, cached.syncDate || "");
            }
          }
        }
      } catch {}
      cacheRestored.current = true;
    });
  }, [userId]);

  // Check if backend has synced since our cache → refetch if so
  useEffect(() => {
    if (!userId) return;

    (async () => {
      // Read lastCatalogSync from config/app
      const db = getFirestore();
      try {
        const configDoc = await getDoc(doc(db, "config", "app"));
        const serverSync = configDoc.data()?.lastCatalogSync;
        const serverSyncStr = serverSync?.toDate?.()?.toISOString?.() || null;

        if (
          serverSyncStr &&
          cachedSyncDate.current &&
          serverSyncStr === cachedSyncDate.current &&
          episodes.length > 0
        ) {
          // Cache is fresh — no refetch needed
          return;
        }

        // Cache is stale or missing — fetch from Firestore
        if (episodes.length === 0) setIsLoading(true);
        setError(null);

        const today = todayStr();
        const upcomingCol = collection(doc(db, "users", userId), "upcoming");
        let snap = await getDocs(
          query(upcomingCol, where("airDate", ">=", today)),
        );

        // If empty, check if subcollection was ever built
        if (snap.size === 0) {
          const built = await AsyncStorage.getItem(CacheKey.UPCOMING_BUILT);
          if (built !== userId) {
            try {
              await httpsCallable(getFunctions(), "rebuildUpcoming")({});
              await AsyncStorage.setItem(CacheKey.UPCOMING_BUILT, userId);
              snap = await getDocs(
                query(upcomingCol, where("airDate", ">=", today)),
              );
            } catch (err) {
              console.error("rebuildUpcoming CF failed:", err);
              setError("Failed to fetch upcoming episodes");
              setIsLoading(false);
              return;
            }
          }
        }

        const tvEps: UpcomingEpisode[] = snap.docs
          .map((d) => d.data() as UpcomingEpisode);

        // Fetch tracked movies with future release dates
        // Single-field query to avoid composite index requirement
        const trackingCol = collection(doc(db, "users", userId), "tracking");
        const movieSnap = await getDocs(
          query(trackingCol, where("mediaType", "==", "movie")),
        );
        const movieEps: UpcomingEpisode[] = [];
        console.log(`[Upcoming] Found ${movieSnap.docs.length} tracked movies, today=${today}`);
        for (const d of movieSnap.docs) {
          const data = d.data() as any;
          // Handle releaseDate as string or Timestamp
          let rd = data.releaseDate;
          if (rd?.toDate) rd = rd.toDate().toISOString().slice(0, 10);
          console.log(`[Upcoming] Movie ${data.tmdbId}: releaseDate=${rd}`);
          if (!rd || rd <= today) continue;
          let title = `Movie #${data.tmdbId}`;
          let posterPath: string | null = null;
          try {
            const catalog = await getCatalogShow(data.tmdbId);
            if (catalog) {
              title = catalog.title;
              posterPath = catalog.posterPath ?? null;
            }
          } catch {}
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

        const eps = [...tvEps, ...movieEps].sort((a, b) =>
          a.airDate.localeCompare(b.airDate),
        );
        console.log(`[Upcoming] Final: ${tvEps.length} TV eps + ${movieEps.length} movies = ${eps.length} total`);

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
  }, [userId, forceRefetch]);

  const retry = useCallback(() => setForceRefetch((t) => t + 1), []);

  return { data: episodes, isLoading, error, retry };
}

// Snapshot holder for optimistic rollbacks
let lastSnapshot: UpcomingEpisode[] | null = null;

export function useUpcomingMutations() {
  /** Add an item to upcoming locally (TV eps added server-side by CF, movies added here) */
  const addShowToUpcoming = useCallback((tmdbId: number, item?: UpcomingEpisode) => {
    if (item) {
      // Add directly to local state + cache (e.g. unreleased movie)
      mutateCachedEpisodes((prev) => {
        if (prev.some((ep) => ep.tmdbShowId === tmdbId && ep.airDate === item.airDate)) return prev;
        return [...prev, item].sort((a, b) => a.airDate.localeCompare(b.airDate));
      });
    } else {
      // TV show — CF populates subcollection, need refetch to pick it up
      triggerInvalidate();
    }
  }, []);

  const removeShowFromUpcoming = useCallback((tmdbId: number) => {
    // Optimistic: remove from local state + cache immediately
    mutateCachedEpisodes((prev) =>
      prev.filter((ep) => ep.tmdbShowId !== tmdbId),
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
        lastSnapshot = prev;
        return fn(prev);
      });
      return snapshot;
    },
    [],
  );

  /** Rollback to a previous snapshot */
  const rollbackUpcoming = useCallback(
    (snapshot: UpcomingEpisode[]) => {
      mutateCachedEpisodes(() => snapshot);
    },
    [],
  );

  return {
    addShowToUpcoming,
    removeShowFromUpcoming,
    invalidateUpcoming,
    mutateCachedUpcoming,
    rollbackUpcoming,
  };
}
