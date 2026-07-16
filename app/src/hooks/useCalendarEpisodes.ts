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
import { discoverTVByAirDate } from "../services";
import { useAuthStore } from "../stores";
import { UpcomingEpisode, CatalogShow } from "../types";

export function useCalendarEpisodes(userId: string | undefined) {
  const [episodesByMonth, setEpisodesByMonth] = useState<Map<string, UpcomingEpisode[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const catalogCache = useRef<Map<string, CatalogShow | null>>(new Map());
  const trackedIds = useRef<Set<string> | null>(null);
  const apiKey = useAuthStore((s) => s.appTmdbApiKey);

  // Load all tracked TV show IDs once
  useEffect(() => {
    if (!userId) return;
    const db = getFirestore();
    getDocs(
      query(
        collection(doc(db, "users", userId), "tracking"),
        where("mediaType", "==", "tv")
      )
    ).then((snap) => {
      trackedIds.current = new Set(
        snap.docs
          .map((d) => d.id)
      );
    });
  }, [userId]);

  const allEpisodes = useMemo(() => {
    const all: UpcomingEpisode[] = [];
    for (const eps of episodesByMonth.values()) {
      all.push(...eps);
    }
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
        // Last day of the month: day 0 of next month
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

        // 1. Discover shows airing this month from TMDB
        const airingIds = await discoverTVByAirDate(apiKey, startDate, endDate);

        // 2. Intersect with tracked shows
        const matchedIds = airingIds.filter((id) => trackedIds.current!.has(String(id)));

        // 3. Read only matched catalog docs
        const db = getFirestore();
        const episodes: UpcomingEpisode[] = [];

        const docs = await Promise.all(
          matchedIds.map((id) => {
            const key = String(id);
            const cached = catalogCache.current.get(key);
            if (cached !== undefined) return Promise.resolve(cached);
            return getDoc(doc(db, "shows", key)).then((d) => {
              const data = d.exists()
                ? ({ id: d.id, ...d.data() } as unknown as CatalogShow)
                : null;
              catalogCache.current.set(key, data);
              return data;
            });
          })
        );

        for (const catalog of docs) {
          if (!catalog) continue;
          for (const season of catalog.seasons || []) {
            if (season.seasonNumber === 0) continue;
            for (const ep of season.episodes || []) {
              if (!ep.airDate) continue;
              if (ep.airDate >= startDate && ep.airDate <= endDate) {
                episodes.push({
                  tmdbShowId: catalog.tmdbId ?? Number(catalog.id),
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
        }

        setEpisodesByMonth((prev) => {
          const next = new Map(prev);
          next.set(monthKey, episodes);
          return next;
        });
      } finally {
        setLoading(false);
      }
    },
    [userId, apiKey, episodesByMonth, loading]
  );

  return {
    episodes: allEpisodes,
    loading,
    loadMonthEpisodes,
  };
}
