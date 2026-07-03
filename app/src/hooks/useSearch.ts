import { useInfiniteQuery } from "@tanstack/react-query";
import { searchMulti } from "../services/tmdb";
import { useAuthStore } from "../stores/authStore";
import { TMDBShow } from "../types";

export function useSearch(query: string) {
  const apiKey = useAuthStore((s) => s.tmdbApiKey)!;

  return useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam = 1 }) => searchMulti(apiKey, query, pageParam),
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
