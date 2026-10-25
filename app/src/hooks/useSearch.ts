import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { searchMulti } from "../services";
import { useAuthStore } from "../stores";
import { TMDBShow, QueryKey } from "../types";

type SearchPage = Awaited<ReturnType<typeof searchMulti>>;

// Module-level: an inline select is a new function each render, so React Query re-runs it
// (flatMap + structural compare of every loaded result) on every render of the screen
const selectResults = (data: InfiniteData<SearchPage, number>) => ({
	pages: data.pages,
	pageParams: data.pageParams,
	results: data.pages.flatMap((p) => p.results) as unknown as TMDBShow[],
});

export function useSearch(query: string, mediaType: "all" | "tv" | "movie" = "all") {
	const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;

	return useInfiniteQuery({
		queryKey: [QueryKey.SEARCH, query, mediaType],
		queryFn: ({ pageParam = 1 }) => searchMulti(apiKey, query, pageParam, mediaType),
		getNextPageParam: (lastPage) =>
			lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
		initialPageParam: 1,
		enabled: query.length > 0,
		select: selectResults,
	});
}
