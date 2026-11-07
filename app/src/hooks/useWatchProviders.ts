import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCountryNames } from "../services/tmdb";
import { fetchWatchProviders } from "../services/watchProviders";
import { getUserRegion, intlCountryName } from "../services/userRegion";
import { useAuthStore } from "../stores";
import { cacheWatchProviders, getCachedCatalogShow } from "./useWatchlist";
import type { ShowDetailsResult } from "./useShowDetails";
import {
	COUNTRY_NAMES,
	MediaType,
	QueryKey,
	USER_REGION_TTL_MS,
	WATCH_PROVIDERS_STALE_MS,
} from "../enums";

/** The viewer's country — looked up once per session, shared by every info page */
export function useUserRegion() {
	return useQuery({
		queryKey: [QueryKey.USER_REGION],
		queryFn: getUserRegion,
		staleTime: USER_REGION_TTL_MS,
		gcTime: Infinity,
	});
}

/** "DE" → "Germany": the app's country names, the runtime's, else TMDB's country list (fetched
 *  once per session, only for a code neither knows — Hermes has no Intl.DisplayNames) */
export function useCountryName(region: string | undefined): string | undefined {
	const apiKey = useAuthStore((s) => s.appTmdbApiKey);
	const known = region ? (COUNTRY_NAMES[region] ?? intlCountryName(region)) : null;
	const { data: names } = useQuery({
		queryKey: [QueryKey.COUNTRY_NAMES],
		enabled: !!region && !known && !!apiKey,
		queryFn: () => getCountryNames(apiKey!),
		staleTime: Infinity,
		gcTime: Infinity,
	});
	if (!region) return undefined;
	return known ?? names?.[region] ?? region;
}

/**
 * Where a title streams in the viewer's country (info page Where to Watch). From the title's
 * catalog doc when it's there (cached, or read with the page — no extra call); otherwise the
 * watchProviders CF, whose answer goes onto the cached catalog for next time
 */
export function useWatchProviders(tmdbId: number, mediaType: MediaType) {
	const queryClient = useQueryClient();
	const { data: region } = useUserRegion();
	const pageCatalog = queryClient.getQueryData<ShowDetailsResult>([
		QueryKey.SHOW,
		tmdbId,
		mediaType,
	])?.catalog;
	const stored = region
		? (getCachedCatalogShow(tmdbId, mediaType)?.watchProviders?.[region] ??
			pageCatalog?.watchProviders?.[region])
		: undefined;
	const fetched = useQuery({
		queryKey: [QueryKey.WATCH_PROVIDERS, tmdbId, mediaType, region],
		enabled: !!region && !stored && tmdbId > 0,
		queryFn: async () => {
			const value = await fetchWatchProviders(tmdbId, mediaType, region!);
			cacheWatchProviders(tmdbId, mediaType, region!, value);
			return value;
		},
		staleTime: WATCH_PROVIDERS_STALE_MS,
	});
	return {
		region,
		data: stored ?? fetched.data,
		isPending: !stored && (!region || fetched.isPending),
		isError: !stored && fetched.isError,
	};
}
