import { useInfiniteQuery } from "@tanstack/react-query";
import { searchMulti } from "../services";
import { useAuthStore } from "../stores";
import { TMDBShow, QueryKey } from "../types";

export function useSearch(query: string, mediaType: "all" | "tv" | "movie" = "all") {
	const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;

	return useInfiniteQuery({
		queryKey: [QueryKey.SEARCH, query, mediaType],
		queryFn: ({ pageParam = 1 }) => searchMulti(apiKey, query, pageParam, mediaType),
		getNextPageParam: (lastPage) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
		initialPageParam: 1,
		enabled: query.length > 0,
		select: (data) => ({
			pages: data.pages,
			pageParams: data.pageParams,
			results: data.pages.flatMap((p) => p.results) as unknown as TMDBShow[],
		}),
	});
}
