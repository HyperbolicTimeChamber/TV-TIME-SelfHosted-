import { useQuery } from "@tanstack/react-query";
import { getTrending } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useTrending(mediaType: string = "tv") {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useQuery({
    queryKey: ["trending", mediaType],
    queryFn: () => getTrending(apiKey, mediaType),
    staleTime: 60 * 60 * 1000,
    select: (data) => data.results as unknown as TMDBShow[],
  });
}
