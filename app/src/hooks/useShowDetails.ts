import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["show", tmdbId, mediaType],
    queryFn: () => getShowDetails(apiKey, tmdbId, mediaType),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => data as unknown as TMDBShow,
  });
}
