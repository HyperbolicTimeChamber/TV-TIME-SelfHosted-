import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services/functions";
import { TMDBShow } from "../types";

export function useShowDetails(tmdbId: number, mediaType: string = "tv") {
  return useQuery({
    queryKey: ["show", tmdbId, mediaType],
    queryFn: () => getShowDetails(tmdbId, mediaType),
    staleTime: 24 * 60 * 60 * 1000,
    select: (data) => data as unknown as TMDBShow,
  });
}
