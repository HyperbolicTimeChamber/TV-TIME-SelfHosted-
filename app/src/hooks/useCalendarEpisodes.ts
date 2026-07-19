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
import { discoverTVByAirDate, getShowDetails } from "../services";
import { useAuthStore } from "../stores";
import { UpcomingEpisode, CatalogShow, MediaType } from "../types";

const CALENDAR_CACHE_KEY = "calendar_months";
const MAX_CACHED_MONTHS = 12;

interface CalendarCache {
  months: Record<string, UpcomingEpisode[]>;
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
  // Prune to MAX_CACHED_MONTHS most recent
  const keys = Object.keys(cache.months).sort().reverse();
  if (keys.length > MAX_CACHED_MONTHS) {
    for (const key of keys.slice(MAX_CACHED_MONTHS)) {
      delete cache.months[key];
    }
  }
  await AsyncStorage.setItem(CALENDAR_CACHE_KEY, JSON.stringify(cache)).catch(() => {});
}

export function useCalendarEpisodes(userId: string | undefined) {
  const [episodesByMonth, setEpisodesByMonth] = useState<
    Map<string, UpcomingEpisode[]>
  >(new Map());
  const [loading, setLoading] = useState(false);
  const trackedIds = useRef<Set<string> | null>(null);
  const movieDocs = useRef<Array<{ tmdbId: number; releaseDate: string; title?: string; posterPath?: string | null }>>([]);
  const calendarCacheRef = useRef<CalendarCache>({ months: {} });
  const cacheLoaded = useRef(false);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey);

  // Load persisted cache + tracked IDs on mount
  useEffect(() => {
    if (!userId) return;

    // Load calendar cache
    loadCalendarCache().then((cache) => {
      calendarCacheRef.current = cache;
      // Restore cached months into state
      const restored = new Map<string, UpcomingEpisode[]>();
      for (const [key, eps] of Object.entries(cache.months)) {
        restored.set(key, eps);
      }
      if (restored.size > 0) setEpisodesByMonth(restored);
      cacheLoaded.current = true;
    });

    // Load tracked IDs
    const db = getFirestore();
    const trackingCol = collection(doc(db, "users", userId), "tracking");
    getDocs(query(trackingCol, where("mediaType", "==", MediaType.TV))).then(
      (snap) => { trackedIds.current = new Set(snap.docs.map((d) => d.id)); },
    );
    getDocs(query(trackingCol, where("mediaType", "==", MediaType.MOVIE))).then(
      (snap) => {
        movieDocs.current = snap.docs
          .map((d) => {
            const data = d.data() as any;
            return { tmdbId: data.tmdbId, releaseDate: data.releaseDate || null, title: data.title, posterPath: data.posterPath };
          })
          .filter((m) => m.releaseDate);
      },
    );
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

        // 1. Discover TV shows airing this month from TMDB
        const airingIds = await discoverTVByAirDate(apiKey, startDate, endDate);
        const matchedIds = airingIds.filter((id) => trackedIds.current!.has(String(id)));

        // 2. Read matched catalog docs for episode details
        const db = getFirestore();
        const episodes: UpcomingEpisode[] = [];
        const catalogDocs = await Promise.all(
          matchedIds.map((id) =>
            getDoc(doc(db, "shows", String(id))).then((d) =>
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

        // 3. Merge with upcoming subcollection
        const upcomingSnap = await getDocs(
          query(
            collection(doc(db, "users", userId), "upcoming"),
            where("airDate", ">=", startDate),
            where("airDate", "<=", endDate),
          ),
        );
        const seen = new Set(
          episodes.map((e) => `${e.tmdbShowId}_S${e.season}E${e.episode}`),
        );
        for (const d of upcomingSnap.docs) {
          const ep = d.data() as UpcomingEpisode;
          const key = `${ep.tmdbShowId}_S${ep.season}E${ep.episode}`;
          if (!seen.has(key)) { episodes.push(ep); seen.add(key); }
        }

        // 4. Add tracked movies releasing this month — fetch title from TMDB if missing
        for (const movie of movieDocs.current) {
          if (movie.releaseDate < startDate || movie.releaseDate > endDate) continue;
          const movieKey = `movie_${movie.tmdbId}`;
          if (seen.has(movieKey)) continue;

          let title = movie.title || null;
          let posterPath = movie.posterPath || null;
          if (!title) {
            try {
              const details = await getShowDetails(apiKey, movie.tmdbId, "movie");
              title = details.title || details.name || null;
              posterPath = details.poster_path || posterPath;
            } catch {}
          }
          title = title || `Movie #${movie.tmdbId}`;

          episodes.push({
            tmdbShowId: movie.tmdbId,
            showTitle: title,
            posterPath,
            season: 0,
            episode: 0,
            episodeTitle: title,
            airDate: movie.releaseDate,
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

  return { episodes: allEpisodes, loading, loadMonthEpisodes };
}
