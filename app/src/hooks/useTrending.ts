import { useQuery } from "@tanstack/react-query";
import { getTrending } from "../services";
import { useAuthStore } from "../stores";
import { TMDBShow, QueryKey } from "../types";

export function useTrending(mediaType: string = "tv") {
	const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;

	return useQuery({
		queryKey: [QueryKey.TRENDING, mediaType],
		queryFn: () => getTrending(apiKey, mediaType),
		staleTime: 60 * 60 * 1000,
		select: (data) => data.results as unknown as TMDBShow[],
	});
}
