import { useQuery } from "@tanstack/react-query";
import { getSeasonDetails, getCatalogShow } from "../services";
import { useAuthStore } from "../stores";
import { TMDBEpisode } from "../types";

export function useSeasonDetails(tmdbId: number, seasonNumber: number, enabled: boolean = true) {
  return useQuery({
    queryKey: ["season", tmdbId, seasonNumber],
    enabled,
    queryFn: async () => {
      // Try catalog first
      const catalogShow = await getCatalogShow(tmdbId);
      if (catalogShow) {
        const season = catalogShow.seasons.find(
          (s) => s.seasonNumber === seasonNumber
        );
        if (season) {
          return {
            name: `Season ${seasonNumber}`,
            season_number: seasonNumber,
            episodes: season.episodes.map((ep) => ({
              id: 0,
              episode_number: ep.episodeNumber,
              season_number: seasonNumber,
              name: ep.title,
              overview: "",
              air_date: ep.airDate,
              runtime: ep.runtime,
              still_path: null,
            })) as TMDBEpisode[],
          };
        }
      }

      // Fallback to TMDB
      const apiKey = useAuthStore.getState().appTmdbApiKey;
      if (!apiKey) throw new Error("No TMDB API key available");
      return getSeasonDetails(apiKey, tmdbId, seasonNumber);
    },
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => {
      const d = data as { episodes: TMDBEpisode[]; name: string; season_number: number };
      return d;
    },
  });
}
