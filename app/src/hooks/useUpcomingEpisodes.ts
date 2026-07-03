import { useQuery } from "@tanstack/react-query";
import { getUpcomingEpisodes } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { UpcomingEpisode } from "../types";

export function useUpcomingEpisodes(tmdbIds: number[]) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: () => getUpcomingEpisodes(apiKey, tmdbIds),
    staleTime: 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
    select: (data) => data.episodes as UpcomingEpisode[],
  });
}
