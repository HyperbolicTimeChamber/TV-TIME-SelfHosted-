import { useQuery } from "@tanstack/react-query";
import { getUpcomingEpisodes } from "../services/functions";
import { UpcomingEpisode } from "../types";

export function useUpcomingEpisodes(tmdbIds: number[]) {
  return useQuery({
    queryKey: ["upcoming", tmdbIds],
    queryFn: () => getUpcomingEpisodes(tmdbIds),
    staleTime: 60 * 60 * 1000,
    enabled: tmdbIds.length > 0,
    select: (data) => data.episodes as UpcomingEpisode[],
  });
}
