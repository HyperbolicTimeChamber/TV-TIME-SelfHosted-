import { useQuery } from "@tanstack/react-query";
import { getCountryNames } from "../services/tmdb";
import { getUserRegion, intlCountryName } from "../services/userRegion";
import { useAuthStore } from "../stores";
import { useTitleExtras } from "./useTitleExtras";
import {
	COUNTRY_NAMES,
	MediaType,
	QueryKey,
	USER_REGION_TTL_MS,
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

/** Where a title streams in the viewer's country (info page Where to Watch) — its extras' part */
export function useWatchProviders(tmdbId: number, mediaType: MediaType) {
	const { region, data, isPending, isError } = useTitleExtras(tmdbId, mediaType);
	return { region, data: data?.providers, isPending, isError };
}
