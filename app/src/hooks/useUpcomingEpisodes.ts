import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFirestore,
  doc,
  getDoc,
} from "@react-native-firebase/firestore";
import { UpcomingEpisode, TrackingItem, CatalogShow } from "../types";

export function useUpcomingEpisodes(tvShows: TrackingItem[]) {
  const tmdbIds = useMemo(() => tvShows.map((s) => s.tmdbId), [tvShows]);

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: async () => {
      const db = getFirestore();
      const today = new Date().toISOString().slice(0, 10);
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
              if (ep.airDate >= today) {
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

      return episodes.sort((a, b) => a.airDate.localeCompare(b.airDate));
    },
    staleTime: 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
  });

  return {
    data: data ?? [],
    isLoading,
  };
}
