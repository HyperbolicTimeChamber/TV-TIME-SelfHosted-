import { useQuery } from "@tanstack/react-query";
import { getTrending } from "../services/functions";
import { TMDBShow } from "../types";

export function useTrending(mediaType: string = "tv") {
  return useQuery({
    queryKey: ["trending", mediaType],
    queryFn: () => getTrending(mediaType),
    staleTime: 60 * 60 * 1000,
    select: (data) => data.results as unknown as TMDBShow[],
  });
}
