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
import { UpcomingEpisode, CatalogShow } from "../types";

const CACHE_KEY = "upcoming_episodes_cache";
const BUILT_KEY = "upcoming_subcollection_built";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

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

export function useUpcomingEpisodes(userId: string | undefined) {
  const [episodes, setEpisodes] = useState<UpcomingEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState(0);
  const cacheRestored = useRef(false);

  // Listen for invalidation
  useEffect(() => {
    const listener = () => setTrigger((t) => t + 1);
    invalidateListeners.add(listener);
    return () => {
      invalidateListeners.delete(listener);
    };
  }, []);

  // Listen for direct mutations
  useEffect(() => {
    const cb: MutateCallback = (fn) => setEpisodes((prev) => fn(prev));
    mutateListeners.add(cb);
    return () => {
      mutateListeners.delete(cb);
    };
  }, []);

  // Restore from local cache on mount
  useEffect(() => {
    if (!userId || cacheRestored.current) return;
    AsyncStorage.getItem(CACHE_KEY).then((raw) => {
      if (!raw) {
        cacheRestored.current = true;
        return;
      }
      try {
        const cached = JSON.parse(raw);
        const age = Date.now() - (cached.timestamp ?? 0);
        if (
          cached.userId === userId &&
          age < CACHE_MAX_AGE_MS &&
          cached.episodes?.length > 0
        ) {
          setEpisodes(cached.episodes);
          setIsLoading(false);
        }
      } catch {}
      cacheRestored.current = true;
    });
  }, [userId]);

  // Fetch from Firestore upcoming subcollection
  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setIsLoading(false);
      return;
    }

    (async () => {
      if (episodes.length === 0) setIsLoading(true);
      setError(null);

      const db = getFirestore();
      const today = todayStr();
      const upcomingCol = collection(doc(db, "users", userId), "upcoming");
      let snap = await getDocs(
        query(upcomingCol, where("airDate", ">=", today)),
      );

      // If empty, check if subcollection was ever built
      if (snap.size === 0) {
        const built = await AsyncStorage.getItem(BUILT_KEY);
        if (built !== userId) {
          try {
            await httpsCallable(getFunctions(), "rebuildUpcoming")({});
            await AsyncStorage.setItem(BUILT_KEY, userId);
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

      const eps: UpcomingEpisode[] = snap.docs
        .map((d) => ({ ...d.data(), mediaType: "tv" } as UpcomingEpisode));

      // Also fetch tracked movies with future release dates
      const movieTrackingSnap = await getDocs(
        query(
          collection(doc(db, "users", userId), "tracking"),
          where("mediaType", "==", "movie"),
        ),
      );
      for (const d of movieTrackingSnap.docs) {
        const catalogDoc = await getDoc(doc(db, "shows", d.id));
        if (!catalogDoc.exists()) continue;
        const catalog = catalogDoc.data() as CatalogShow;
        if (catalog.releaseDate && catalog.releaseDate >= today) {
          eps.push({
            tmdbShowId: Number(d.id),
            showTitle: catalog.title ?? "",
            posterPath: catalog.posterPath ?? null,
            season: 0,
            episode: 0,
            episodeTitle: catalog.title ?? "",
            airDate: catalog.releaseDate,
            runtime: catalog.runtime ?? null,
            mediaType: "movie",
          });
        }
      }

      eps.sort((a, b) => a.airDate.localeCompare(b.airDate));

      setEpisodes(eps);
      setIsLoading(false);

      // Cache locally
      if (eps.length > 0) {
        AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            userId,
            timestamp: Date.now(),
            episodes: eps,
          }),
        ).catch(() => {});
      }
    })().catch((err) => {
      console.error("Upcoming fetch error:", err);
      setError("Failed to fetch upcoming episodes");
      setIsLoading(false);
    });
  }, [userId, trigger]);

  const retry = useCallback(() => setTrigger((t) => t + 1), []);

  return { data: episodes, isLoading, error, retry };
}

export function useUpcomingMutations() {
  const addShowToUpcoming = useCallback((_tmdbId: number) => {
    // CF populates subcollection server-side; invalidate so next tab open refetches
    triggerInvalidate();
  }, []);

  const removeShowFromUpcoming = useCallback((tmdbId: number) => {
    // Optimistic: remove from local state immediately
    mutateCachedEpisodes((prev) =>
      prev.filter((ep) => ep.tmdbShowId !== tmdbId),
    );
  }, []);

  const invalidateUpcoming = useCallback(() => {
    triggerInvalidate();
  }, []);

  return { addShowToUpcoming, removeShowFromUpcoming, invalidateUpcoming };
}
