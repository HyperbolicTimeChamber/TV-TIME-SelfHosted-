import { useCallback, useEffect, useState } from "react";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "@react-native-firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient, QueryClient } from "@tanstack/react-query";
import { UpcomingEpisode, CatalogShow, WatchStatus } from "../types";

const UPCOMING_BUILT_KEY = "upcoming_cache_built";

async function isUpcomingBuilt(): Promise<boolean> {
  return (await AsyncStorage.getItem(UPCOMING_BUILT_KEY)) === "true";
}

async function markUpcomingBuilt(): Promise<void> {
  await AsyncStorage.setItem(UPCOMING_BUILT_KEY, "true");
}

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
const MAX_EPISODES = 1000;

// Lightweight catalog shape — only fields needed for upcoming
interface CatalogLite {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasons: Array<{
    seasonNumber: number;
    episodes: Array<{ episodeNumber: number; title: string; airDate: string | null; runtime: number | null }>;
  }>;
}

function toLite(catalog: CatalogShow): CatalogLite {
  const today = new Date().toISOString().slice(0, 10);
  return {
    tmdbId: catalog.tmdbId,
    title: catalog.title,
    posterPath: catalog.posterPath,
    seasons: catalog.seasons
      .filter((s) => s.seasonNumber > 0)
      .map((s) => ({
        seasonNumber: s.seasonNumber,
        episodes: s.episodes.filter((ep) => ep.airDate && ep.airDate >= today),
      }))
      .filter((s) => s.episodes.length > 0),
  };
}

async function getCatalogCached(
  queryClient: QueryClient,
  db: ReturnType<typeof getFirestore>,
  showId: string
): Promise<CatalogLite | null> {
  const cached = queryClient.getQueryData(["catalog", showId]) as CatalogLite | undefined;
  if (cached) return cached;

  const showDoc = await getDoc(doc(db, "shows", showId));
  if (!showDoc.exists()) return null;

  const full = { ...showDoc.data() } as unknown as CatalogShow;
  const lite = toLite(full);
  queryClient.setQueryData(["catalog", showId], lite);
  queryClient.setQueryDefaults(["catalog", showId], { gcTime: ONE_WEEK, staleTime: ONE_WEEK });
  return lite;
}

function extractAllEpisodes(catalogs: (CatalogLite | null)[]): UpcomingEpisode[] {
  const today = new Date().toISOString().slice(0, 10);
  const episodes: UpcomingEpisode[] = [];

  for (const catalog of catalogs) {
    if (!catalog) continue;
    for (const season of catalog.seasons) {
      for (const ep of season.episodes) {
        if (!ep.airDate || ep.airDate < today) continue;
        episodes.push({
          tmdbShowId: catalog.tmdbId,
          showTitle: catalog.title,
          posterPath: catalog.posterPath,
          season: season.seasonNumber,
          episode: ep.episodeNumber,
          episodeTitle: ep.title,
          airDate: ep.airDate!,
          runtime: ep.runtime,
        });
      }
    }
  }

  episodes.sort((a, b) => a.airDate.localeCompare(b.airDate));

  if (episodes.length > MAX_EPISODES) {
    const cutoffDate = episodes[MAX_EPISODES - 1].airDate;
    const lastIdx = episodes.findLastIndex((ep) => ep.airDate === cutoffDate);
    return episodes.slice(0, lastIdx + 1);
  }

  return episodes;
}

// Direct cache mutation callbacks
type MutateCallback = (fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) => void;
let mutateListeners: Set<MutateCallback> = new Set();
let invalidateListeners: Set<() => void> = new Set();

function mutateCachedEpisodes(fn: (prev: UpcomingEpisode[]) => UpcomingEpisode[]) {
  mutateListeners.forEach((cb) => cb(fn));
}

function triggerInvalidate() {
  invalidateListeners.forEach((fn) => fn());
}

export function useUpcomingEpisodes(userId: string | undefined) {
  const queryClient = useQueryClient();
  const [episodes, setEpisodes] = useState<UpcomingEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [trigger, setTrigger] = useState(0);

  // Listen for invalidation
  useEffect(() => {
    const listener = () => setTrigger((t) => t + 1);
    invalidateListeners.add(listener);
    return () => { invalidateListeners.delete(listener); };
  }, []);

  // Listen for direct mutations
  useEffect(() => {
    const cb: MutateCallback = (fn) => setEpisodes((prev) => fn(prev));
    mutateListeners.add(cb);
    return () => { mutateListeners.delete(cb); };
  }, []);

  useEffect(() => {
    if (!userId) {
      setEpisodes([]);
      setIsLoading(false);
      return;
    }

    (async () => {
      const built = await isUpcomingBuilt();
      if (!built || episodes.length === 0) setIsLoading(true);

      const db = getFirestore();
      const today = new Date().toISOString().slice(0, 10);

      // Fast path: try upcoming subcollection first
      const upcomingCol = collection(doc(db, "users", userId), "upcoming");
      const upcomingSnap = await getDocs(
        query(upcomingCol, where("airDate", ">=", today))
      );

      if (upcomingSnap.size > 0) {
        const eps = upcomingSnap.docs
          .map((d) => d.data() as UpcomingEpisode)
          .sort((a, b) => a.airDate.localeCompare(b.airDate));
        setEpisodes(eps);
        setIsLoading(false);
        if (!built) await markUpcomingBuilt();
        return;
      }

      // Slow path: build from catalog (first time / subcollection empty)
      const trackingSnap = await getDocs(
        query(
          collection(doc(db, "users", userId), "tracking"),
          where("mediaType", "==", "tv"),
          where("status", "in", [WatchStatus.WATCHING, WatchStatus.REWATCHING, WatchStatus.PLAN_TO_WATCH])
        )
      );
      const trackedIds = trackingSnap.docs.map((d) => d.id);

      if (trackedIds.length === 0) {
        setEpisodes([]);
        setIsLoading(false);
        return;
      }

      // Stream: show episodes as each catalog resolves
      const catalogs: (CatalogLite | null)[] = new Array(trackedIds.length).fill(null);
      let shownFirst = false;

      const promises = trackedIds.map((id, idx) =>
        getCatalogCached(queryClient, db, id).then((catalog) => {
          catalogs[idx] = catalog;
          if (!catalog) return;

          const all = extractAllEpisodes(catalogs);
          setEpisodes(all);

          if (!shownFirst) {
            shownFirst = true;
            setIsLoading(false);
          }
        })
      );

      await Promise.all(promises);
      if (!shownFirst) setIsLoading(false);
      await markUpcomingBuilt();
    })().catch((err) => {
      console.error("Upcoming fetch error:", err);
      setIsLoading(false);
    });
  }, [userId, queryClient, trigger]);

  return { data: episodes, isLoading };
}

export function useUpcomingMutations() {
  const queryClient = useQueryClient();

  const addShowToUpcoming = useCallback((tmdbId: number) => {
    const cached = queryClient.getQueryData(["catalog", String(tmdbId)]) as CatalogLite | undefined;
    if (!cached) return;

    const today = new Date().toISOString().slice(0, 10);
    const newEps: UpcomingEpisode[] = [];
    for (const season of cached.seasons) {
      for (const ep of season.episodes) {
        if (!ep.airDate || ep.airDate < today) continue;
        newEps.push({
          tmdbShowId: cached.tmdbId,
          showTitle: cached.title,
          posterPath: cached.posterPath,
          season: season.seasonNumber,
          episode: ep.episodeNumber,
          episodeTitle: ep.title,
          airDate: ep.airDate!,
          runtime: ep.runtime,
        });
      }
    }

    if (newEps.length > 0) {
      mutateCachedEpisodes((prev) => {
        const merged = [...prev, ...newEps];
        merged.sort((a, b) => a.airDate.localeCompare(b.airDate));
        return merged;
      });
    }
  }, [queryClient]);

  const removeShowFromUpcoming = useCallback((tmdbId: number) => {
    mutateCachedEpisodes((prev) => prev.filter((ep) => ep.tmdbShowId !== tmdbId));
    queryClient.removeQueries({ queryKey: ["catalog", String(tmdbId)] });
  }, [queryClient]);

  const invalidateUpcoming = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["catalog"] });
    triggerInvalidate();
  }, [queryClient]);

  return { addShowToUpcoming, removeShowFromUpcoming, invalidateUpcoming };
}
