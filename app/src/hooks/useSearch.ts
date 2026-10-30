import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { searchTitles } from "../services/searchTitles";
import { useAuthStore } from "../stores";
import { TMDBShow, QueryKey } from "../types";
import { MediaFilter } from "../enums";
import type { SearchBatch } from "../utils/searchBatch";

// Module-level: an inline select is a new function each render, so React Query re-runs it
// (flatMap + structural compare of every loaded result) on every render of the screen
const selectResults = (data: InfiniteData<SearchBatch, number>) => ({
	pages: data.pages,
	pageParams: data.pageParams,
	results: data.pages.flatMap((p) => p.results) as TMDBShow[],
});

/** Title search, a batch of several TMDB pages per "page" (see searchTitles) */
export function useSearch(query: string, mediaType: MediaFilter = MediaFilter.ALL) {
	const apiKey = useAuthStore((s) => s.appTmdbApiKey)!;

	return useInfiniteQuery({
		queryKey: [QueryKey.SEARCH, query, mediaType],
		queryFn: ({ pageParam }) => searchTitles(apiKey, query, mediaType, pageParam),
		getNextPageParam: (last) => (last.batch < last.totalBatches ? last.batch + 1 : undefined),
		initialPageParam: 1,
		enabled: query.length > 0,
		select: selectResults,
		// A query's results don't change within a session — never refetched (each one is a CF call)
		staleTime: Infinity,
	});
}
