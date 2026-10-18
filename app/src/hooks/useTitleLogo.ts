import { useQuery } from "@tanstack/react-query";
import { getTitleLogo } from "../services/tmdb";
import { useAuthStore } from "../stores";
import { MediaType, QueryKey } from "../types";
import { getCachedCatalogShow } from "./useWatchlist";

/**
 * Title logo for popups: the one passed in, else the cached catalog's, else fetched from TMDB
 * (titles not in the library — e.g. search results — have no catalog yet). null → show the name;
 * undefined → still fetching (keep the space, show nothing yet).
 */
export function useTitleLogo(
	logoPath: string | null | undefined,
	tmdbId?: number,
	mediaType?: MediaType,
): string | null | undefined {
	const catalog = tmdbId && mediaType ? getCachedCatalogShow(tmdbId, mediaType) : null;
	// A catalog that has the field already knows the answer (null = TMDB has no logo)
	const known =
		logoPath ?? (catalog && "logoPath" in catalog ? (catalog.logoPath ?? null) : undefined);
	const fetching = known === undefined && !!tmdbId && !!mediaType;
	const { data } = useQuery({
		queryKey: [QueryKey.TITLE_LOGO, mediaType, tmdbId],
		enabled: fetching,
		queryFn: async () => {
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (!apiKey) return null;
			return getTitleLogo(apiKey, tmdbId!, mediaType!).catch(() => null);
		},
		staleTime: Infinity,
	});
	if (known !== undefined) return known;
	return fetching ? data : null;
}
