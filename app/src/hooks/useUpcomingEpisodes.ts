import { useCallback } from "react";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "@react-native-firebase/firestore";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UpcomingEpisode, CatalogShow } from "../types";

const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;

async function fetchUpcoming(userId: string): Promise<UpcomingEpisode[]> {
  const db = getFirestore();
  const today = new Date().toISOString().slice(0, 10);

  const trackingSnap = await getDocs(
    query(
      collection(doc(db, "users", userId), "tracking"),
      where("mediaType", "==", "tv")
    )
  );
  const trackedIds = trackingSnap.docs.map((d) => d.id);

  if (trackedIds.length === 0) return [];

  const catalogDocs = await Promise.all(
    trackedIds.map((id) =>
      getDoc(doc(db, "shows", id)).then((d) =>
        d.exists() ? ({ ...d.data() } as unknown as CatalogShow) : null
      )
    )
  );

  const episodes: UpcomingEpisode[] = [];
  for (const catalog of catalogDocs) {
    if (!catalog) continue;
    for (const season of catalog.seasons || []) {
      if (season.seasonNumber === 0) continue;
      for (const ep of season.episodes || []) {
        if (!ep.airDate || ep.airDate < today) continue;
        episodes.push({
          tmdbShowId: catalog.tmdbId,
          showTitle: catalog.title,
          posterPath: catalog.posterPath,
          season: season.seasonNumber,
          episode: ep.episodeNumber,
          episodeTitle: ep.title,
          airDate: ep.airDate,
          runtime: ep.runtime,
        });
      }
    }
  }

  episodes.sort((a, b) => a.airDate.localeCompare(b.airDate));
  return episodes;
}

export function useUpcomingEpisodes(userId: string | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ["upcomingEpisodes", userId],
    queryFn: () => fetchUpcoming(userId!),
    enabled: !!userId,
    staleTime: ONE_WEEK,
    gcTime: ONE_WEEK,
  });

  return {
    data: data ?? [],
    isLoading,
    loadMore: () => {},
    loadingMore: false,
    hasMore: false,
  };
}

export function useInvalidateUpcoming() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["upcomingEpisodes"] });
  }, [queryClient]);
}
