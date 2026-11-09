import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { fetchCastPage, fetchTitleExtras } from "../services/titleExtras";
import { cacheTitleExtras, getCachedCatalogShow } from "./useWatchlist";
import type { ShowDetailsResult } from "./useShowDetails";
import { useUserRegion } from "./useWatchProviders";
import { MediaType, QueryKey, TITLE_EXTRAS_STALE_MS } from "../enums";
import type { TitleExtras } from "../types";

/**
 * A title's info page extras: featured cast, directors, studios, the viewer's country's Where
 * to Watch and a movie's release date there. From its catalog doc when everything's there (cached, or read with the page — no
 * call); otherwise one titleExtras CF call fills the gaps, and its answer goes onto the cached
 * catalog for next time. Every section reads this one query
 */
export function useTitleExtras(tmdbId: number, mediaType: MediaType) {
	const queryClient = useQueryClient();
	const { data: region } = useUserRegion();
	const pageCatalog = queryClient.getQueryData<ShowDetailsResult>([
		QueryKey.SHOW,
		tmdbId,
		mediaType,
	])?.catalog;
	const catalog = getCachedCatalogShow(tmdbId, mediaType) ?? pageCatalog;
	const providers = region ? catalog?.watchProviders?.[region] : undefined;
	const localRelease = region ? catalog?.localReleases?.[region] : undefined;
	const stored: TitleExtras | undefined =
		catalog?.cast &&
		catalog.castTotal !== undefined &&
		catalog.studioLogos &&
		(mediaType !== MediaType.MOVIE ||
			(catalog.directors && catalog.writers && localRelease !== undefined)) &&
		providers
			? {
					cast: catalog.cast,
					castTotal: catalog.castTotal,
					localRelease,
					directors: catalog.directors ?? [],
					writers: catalog.writers ?? [],
					studios: catalog.studioLogos,
					providers,
				}
			: undefined;
	const fetched = useQuery({
		queryKey: [QueryKey.TITLE_EXTRAS, tmdbId, mediaType, region],
		enabled: !!region && !stored && tmdbId > 0,
		queryFn: async () => {
			const extras = await fetchTitleExtras(tmdbId, mediaType, region!);
			cacheTitleExtras(tmdbId, mediaType, region!, extras);
			return extras;
		},
		staleTime: TITLE_EXTRAS_STALE_MS,
	});
	return {
		region,
		data: stored ?? fetched.data,
		isPending: !stored && (!region || fetched.isPending),
		isError: !stored && fetched.isError,
	};
}

/**
 * A title's full cast, a page at a time (the View All sheet), while `enabled` — only the matches
 * for a search. A new search keeps the last results up until its own arrive (no skeleton flash)
 */
export function useCastPages(tmdbId: number, mediaType: MediaType, enabled: boolean, query = "") {
	return useInfiniteQuery({
		queryKey: [QueryKey.TITLE_CAST_PAGE, tmdbId, mediaType, query],
		enabled,
		initialPageParam: 0,
		placeholderData: keepPreviousData,
		queryFn: ({ pageParam }) => fetchCastPage(tmdbId, mediaType, pageParam, query),
		getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
		staleTime: TITLE_EXTRAS_STALE_MS,
	});
}
