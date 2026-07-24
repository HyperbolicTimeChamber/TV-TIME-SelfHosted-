import { useQuery } from "@tanstack/react-query";
import { getSeasonDetails, getCatalogShow } from "../services";
import { useAuthStore } from "../stores";
import { TMDBEpisode, QueryKey, MediaType } from "../types";

export function useSeasonDetails(
  tmdbId: number,
  seasonNumber: number,
  enabled: boolean = true,
  fetchImages: boolean = false,
) {
  // Primary query: catalog data (fast, no images)
  const catalogQuery = useQuery({
    queryKey: [QueryKey.SEASON, tmdbId, seasonNumber],
    enabled,
    queryFn: async () => {
      const catalogShow = await getCatalogShow(tmdbId, MediaType.TV);
      if (catalogShow) {
        const season = catalogShow.seasons.find(
          (s) => s.seasonNumber === seasonNumber,
        );
        if (season) {
          return {
            name: `Season ${seasonNumber}`,
            season_number: seasonNumber,
            fromCatalog: true,
            episodes: season.episodes.map((ep) => ({
              id: 0,
              episode_number: ep.episodeNumber,
              season_number: seasonNumber,
              name: ep.title,
              overview: ep.overview ?? "",
              air_date: ep.airDate,
              runtime: ep.runtime,
              still_path: ep.stillPath,
            })) as TMDBEpisode[],
          };
        }
      }

      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (!apiKey) throw new Error("No TMDB API key available");
      const data = await getSeasonDetails(apiKey, tmdbId, seasonNumber);
      return { ...data, fromCatalog: false };
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Secondary query: TMDB images — lazy, only when dropdown expanded
  const imagesQuery = useQuery({
    queryKey: [QueryKey.SEASON_IMAGES, tmdbId, seasonNumber],
    enabled: fetchImages,
    queryFn: async () => {
      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (!apiKey) throw new Error("No TMDB API key available");
      return getSeasonDetails(apiKey, tmdbId, seasonNumber);
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  // Merge: overlay TMDB still_path + overview onto catalog/preloaded data
  let data = catalogQuery.data;
  if (data && imagesQuery.data) {
    const tmdbEps = imagesQuery.data.episodes;
    const tmdbMap = new Map(tmdbEps.map((e) => [e.episode_number, e]));
    data = {
      ...data,
      episodes: data.episodes.map((ep) => {
        const tmdb = tmdbMap.get(ep.episode_number);
        return tmdb
          ? { ...ep, still_path: tmdb.still_path, overview: tmdb.overview }
          : ep;
      }),
    };
  }

  return {
    data,
    isLoading: catalogQuery.isLoading,
    imagesLoading: imagesQuery.isLoading,
    imagesData: imagesQuery.data,
  };
}
