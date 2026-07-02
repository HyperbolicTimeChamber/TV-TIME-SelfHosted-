import { useQuery } from "@tanstack/react-query";
import { getSeasonDetails } from "../services/functions";
import { TMDBEpisode } from "../types";

export function useSeasonDetails(tmdbId: number, seasonNumber: number) {
  return useQuery({
    queryKey: ["season", tmdbId, seasonNumber],
    queryFn: () => getSeasonDetails(tmdbId, seasonNumber),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => {
      const d = data as { episodes: TMDBEpisode[]; name: string; season_number: number };
      return d;
    },
  });
}
