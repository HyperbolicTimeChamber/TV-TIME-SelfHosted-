import { useCallback, useMemo, useState } from "react";
import {
  getFirestore,
  doc,
  getDoc,
} from "@react-native-firebase/firestore";
import { UpcomingEpisode, TrackingItem, CatalogShow } from "../types";

export function useCalendarEpisodes(tvShows: TrackingItem[]) {
  const [episodesByMonth, setEpisodesByMonth] = useState<Map<string, UpcomingEpisode[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const allEpisodes = useMemo(() => {
    const all: UpcomingEpisode[] = [];
    for (const eps of episodesByMonth.values()) {
      all.push(...eps);
    }
    return all;
  }, [episodesByMonth]);

  const loadMonthEpisodes = useCallback(
    async (year: number, month: number) => {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      if (episodesByMonth.has(monthKey)) return;
      if (loading) return;

      setLoading(true);
      try {
        const db = getFirestore();
        const episodes: UpcomingEpisode[] = [];

        for (const show of tvShows) {
          if (show.mediaType !== "tv") continue;

          try {
            const showDoc = await getDoc(doc(db, "shows", String(show.tmdbId)));
            if (!showDoc.exists()) continue;
            const catalog = showDoc.data() as CatalogShow;

            for (const season of catalog.seasons || []) {
              if (season.seasonNumber === 0) continue;

              for (const ep of season.episodes || []) {
                if (!ep.airDate) continue;
                const epYear = parseInt(ep.airDate.substring(0, 4), 10);
                const epMonth = parseInt(ep.airDate.substring(5, 7), 10);

                if (epYear === year && epMonth === month) {
                  episodes.push({
                    tmdbShowId: catalog.tmdbId ?? show.tmdbId,
                    showTitle: catalog.title ?? `Show #${show.tmdbId}`,
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
          } catch {
            // Skip shows that fail to load
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
    [tvShows, episodesByMonth, loading]
  );

  return {
    episodes: allEpisodes,
    loading,
    loadMonthEpisodes,
  };
}
