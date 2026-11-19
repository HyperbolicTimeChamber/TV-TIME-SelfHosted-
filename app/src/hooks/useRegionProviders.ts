import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchTitleExtras } from "../services/titleExtras";
import { cacheTitleExtras, getCachedCatalogShow } from "./useWatchlist";
import type { ShowDetailsResult } from "./useShowDetails";
import { MediaType, QueryKey, TITLE_EXTRAS_STALE_MS } from "../enums";
import type { RegionWatchProviders, TitleExtras } from "../types";

/** The title's catalog as the app holds it right now (kept copy, else the info page's) */
function useCachedCatalog(tmdbId: number, mediaType: MediaType) {
	const queryClient = useQueryClient();
	return (
		getCachedCatalogShow(tmdbId, mediaType) ??
		queryClient.getQueryData<ShowDetailsResult>([QueryKey.SHOW, tmdbId, mediaType])?.catalog
	);
}

/**
 * Countries whose Where to Watch for this title is already on the phone — the catalog's
 * `watchProviders` keys plus every country a titleExtras answer is cached for. Read when `active`
 * turns on and again when `version` changes (the sheet passes the picked country, so coming back
 * from one lists it first); not live, so the list never reshuffles under a finger
 */
export function useStoredRegions(
	tmdbId: number,
	mediaType: MediaType,
	active: boolean,
	version: unknown,
): string[] {
	const queryClient = useQueryClient();
	const catalog = useCachedCatalog(tmdbId, mediaType);
	return useMemo(() => {
		if (!active) return [];
		const regions = new Set(Object.keys(catalog?.watchProviders ?? {}));
		const answered = queryClient.getQueriesData<TitleExtras>({
			queryKey: [QueryKey.TITLE_EXTRAS, tmdbId, mediaType],
		});
		for (const [key, data] of answered) {
			const region = key[3];
			if (data && typeof region === "string") regions.add(region);
		}
		return [...regions];
		// catalog is read fresh on each activation / version change on purpose
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, version, tmdbId, mediaType, queryClient]);
}

/**
 * One country's Where to Watch for a title: the catalog's stored answer, else the titleExtras CF
 * (only while `region` is set) whose answer is patched onto the cached catalog (never refetched).
 * Same query key as the info page's own extras, so the viewer's country shares one entry
 */
export function useRegionProviders(
	tmdbId: number,
	mediaType: MediaType,
	region: string | null,
): { data: RegionWatchProviders | undefined; isPending: boolean; isError: boolean } {
	const catalog = useCachedCatalog(tmdbId, mediaType);
	const stored = region ? catalog?.watchProviders?.[region] : undefined;
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
	const waiting = !!region && !stored;
	return {
		data: stored ?? fetched.data?.providers,
		isPending: waiting && fetched.isPending,
		isError: waiting && fetched.isError,
	};
}
