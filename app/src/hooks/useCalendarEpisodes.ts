import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { discoverTVByAirDate, discoverMoviesByReleaseDate } from "../services";
import { useAuthStore } from "../stores";
import { UpcomingEpisode, CatalogShow, MediaType } from "../types";
import { showDocId } from "../utils/docId";

const CALENDAR_CACHE_KEY = "calendar_months";
const MAX_CACHED_MONTHS = 12;

interface CalendarCache {
  months: Record<string, UpcomingEpisode[]>;
  syncDate?: string | null;
}

async function loadCalendarCache(): Promise<CalendarCache> {
  try {
    const raw = await AsyncStorage.getItem(CALENDAR_CACHE_KEY);
    if (!raw) return { months: {} };
    return JSON.parse(raw) as CalendarCache;
  } catch {
    return { months: {} };
  }
}

async function saveCalendarCache(cache: CalendarCache) {
  // Prune to MAX_CACHED_MONTHS most recent, never evict current month
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const keys = Object.keys(cache.months).sort().reverse();
  if (keys.length > MAX_CACHED_MONTHS) {
    for (const key of keys.slice(MAX_CACHED_MONTHS)) {
      if (key !== currentKey) delete cache.months[key];
    }
  }
  await AsyncStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
}

// Global mutation listeners (cross-screen)
type CalendarRemoveCallback = (tmdbId: number) => void;
type CalendarAddMovieCallback = (movie: UpcomingEpisode) => void;
const removeListeners = new Set<CalendarRemoveCallback>();
const addMovieListeners = new Set<CalendarAddMovieCallback>();

export function removeShowFromCalendarGlobal(tmdbId: number) {
  removeListeners.forEach((fn) => fn(tmdbId));
}

export function addMovieToCalendarGlobal(movie: UpcomingEpisode) {
  addMovieListeners.forEach((fn) => fn(movie));
}

export function useCalendarEpisodes(userId: string | undefined) {
  const [episodesByMonth, setEpisodesByMonth] = useState<
    Map<string, UpcomingEpisode[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const trackedIds = useRef<Set<string> | null>(null);
  const trackedMovieIds = useRef<Set<string> | null>(null);
  const calendarCacheRef = useRef<CalendarCache>({ months: {} });
  const cacheLoaded = useRef(false);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey);

  // Load persisted cache + tracked IDs on mount
  useEffect(() => {
    if (!userId) return;
    const db = getFirestore();
    const trackingCol = collection(doc(db, "users", userId), "tracking");

    // Load all in parallel: cache, config sync date, tracked IDs
    Promise.all([
      loadCalendarCache(),
      getDoc(doc(db, "config", "app")).catch(() => null),
      getDocs(query(trackingCol, where("mediaType", "==", MediaType.TV))),
      getDocs(query(trackingCol, where("mediaType", "==", MediaType.MOVIE))),
    ]).then(([cache, configSnap, tvSnap, movieSnap]) => {
      // Tracked IDs
      trackedIds.current = new Set(tvSnap.docs.map((d) => d.id));
      trackedMovieIds.current = new Set(movieSnap.docs.map((d) => d.id));

      // Check sync date — invalidate cache if backend synced since
      const serverSync = configSnap?.data?.()?.lastCatalogSync;
      const serverSyncStr = serverSync?.toDate?.()?.toISOString?.() || null;

      if (serverSyncStr && cache.syncDate && serverSyncStr !== cache.syncDate) {
        // Backend synced — clear cached months
        cache.months = {};
        cache.syncDate = serverSyncStr;
        saveCalendarCache(cache);
      }

      calendarCacheRef.current = cache;
      if (serverSyncStr) calendarCacheRef.current.syncDate = serverSyncStr;

      const restored = new Map<string, UpcomingEpisode[]>();
      for (const [key, eps] of Object.entries(cache.months)) {
        restored.set(key, eps);
      }
      if (restored.size > 0) setEpisodesByMonth(restored);
      cacheLoaded.current = true;
    });
  }, [userId]);

  const allEpisodes = useMemo(() => {
    const all: UpcomingEpisode[] = [];
    for (const eps of episodesByMonth.values()) all.push(...eps);
    return all;
  }, [episodesByMonth]);

  const loadMonthEpisodes = useCallback(
    async (year: number, month: number) => {
      if (!userId || !apiKey) return;
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (episodesByMonth.has(monthKey)) return;
      if (loading) return;

      // Wait for tracked IDs
      if (!trackedIds.current) {
        setTimeout(() => loadMonthEpisodes(year, month), 200);
        return;
      }

      setLoading(true);
      try {
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const db = getFirestore();

        // Run TV + movie discover in parallel
        const [airingIds, movieResults] = await Promise.all([
          discoverTVByAirDate(apiKey, startDate, endDate),
          trackedMovieIds.current?.size
            ? discoverMoviesByReleaseDate(apiKey, startDate, endDate)
            : Promise.resolve([]),
        ]);

        // TV: intersect discover results with tracked IDs → read catalog docs in parallel
        const matchedIds = airingIds.filter((id) => trackedIds.current!.has(String(id)));
        const episodes: UpcomingEpisode[] = [];
        const catalogDocs = await Promise.all(
          matchedIds.map((id) =>
            getDoc(doc(db, "shows", showDocId(id, "tv"))).then((d) =>
              d.exists?.() ? (d.data() as any as CatalogShow) : null,
            ).catch(() => null),
          ),
        );

        for (const catalog of catalogDocs) {
          if (!catalog) continue;
          for (const season of catalog.seasons || []) {
            if (season.seasonNumber === 0) continue;
            for (const ep of season.episodes || []) {
              if (!ep.airDate || ep.airDate < startDate || ep.airDate > endDate) continue;
              episodes.push({
                tmdbShowId: catalog.tmdbId ?? 0,
                showTitle: catalog.title ?? "",
                posterPath: catalog.posterPath ?? null,
                season: season.seasonNumber,
                episode: ep.episodeNumber,
                episodeTitle: ep.title,
                airDate: ep.airDate,
                runtime: ep.runtime ?? null,
              });
            }
          }
        }

        // Movies: intersect discover results with tracked IDs
        const seen = new Set(
          episodes.map((e) => `${e.tmdbShowId}_S${e.season}E${e.episode}`),
        );
        for (const movie of movieResults) {
          if (!trackedMovieIds.current?.has(String(movie.id))) continue;
          const movieKey = `movie_${movie.id}`;
          if (seen.has(movieKey)) continue;
          episodes.push({
            tmdbShowId: movie.id,
            showTitle: movie.title,
            posterPath: movie.poster_path,
            season: 0,
            episode: 0,
            episodeTitle: movie.title,
            airDate: movie.release_date,
            runtime: null,
            mediaType: MediaType.MOVIE,
          });
          seen.add(movieKey);
        }

        // Update state + persist to cache
        setEpisodesByMonth((prev) => {
          const next = new Map(prev);
          next.set(monthKey, episodes);
          return next;
        });
        calendarCacheRef.current.months[monthKey] = episodes;
        saveCalendarCache(calendarCacheRef.current);
      } finally {
        setLoading(false);
      }
    },
    [userId, apiKey, episodesByMonth, loading],
  );

  const removeShowFromCalendar = useCallback(
    (tmdbId: number) => {
      setEpisodesByMonth((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, eps] of next) {
          const filtered = eps.filter((e) => e.tmdbShowId !== tmdbId);
          if (filtered.length !== eps.length) {
            next.set(key, filtered);
            calendarCacheRef.current.months[key] = filtered;
            changed = true;
          }
        }
        if (changed) saveCalendarCache(calendarCacheRef.current);
        return changed ? next : prev;
      });
    },
    [],
  );

  const addMovieToCalendar = useCallback(
    (movie: UpcomingEpisode) => {
      const monthKey = movie.airDate.slice(0, 7); // "2026-07"
      setEpisodesByMonth((prev) => {
        const next = new Map(prev);
        const existing = next.get(monthKey);
        if (!existing) return prev; // month not cached, will be fetched when viewed
        if (existing.some((e) => e.tmdbShowId === movie.tmdbShowId)) return prev;
        const updated = [...existing, movie].sort((a, b) => a.airDate.localeCompare(b.airDate));
        next.set(monthKey, updated);
        calendarCacheRef.current.months[monthKey] = updated;
        saveCalendarCache(calendarCacheRef.current);
        return next;
      });
    },
    [],
  );

  const invalidateMonth = useCallback(
    (year: number, month: number) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      setEpisodesByMonth((prev) => {
        const next = new Map(prev);
        next.delete(monthKey);
        delete calendarCacheRef.current.months[monthKey];
        saveCalendarCache(calendarCacheRef.current);
        return next;
      });
    },
    [],
  );

  // Listen for cross-screen mutations
  useEffect(() => {
    removeListeners.add(removeShowFromCalendar);
    addMovieListeners.add(addMovieToCalendar);
    return () => {
      removeListeners.delete(removeShowFromCalendar);
      addMovieListeners.delete(addMovieToCalendar);
    };
  }, [removeShowFromCalendar, addMovieToCalendar]);

  return {
    episodes: allEpisodes,
    loading,
    loadMonthEpisodes,
    removeShowFromCalendar,
    addMovieToCalendar,
    invalidateMonth,
  };
}
