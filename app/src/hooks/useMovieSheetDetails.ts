import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services";
import { getCachedCatalogShow } from "./useWatchlist";
import { useAuthStore } from "../stores";
import { MediaType, QueryKey } from "../types";
import { movieSheetFromCatalog, movieSheetFromTmdb, type MovieSheetDetails } from "../utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Runtime / director / overview for the add-movie sheet. The cached catalog answers when it has
 * credits (no call); otherwise one TMDB call (no Firestore read). The sheet is already open when
 * this runs — its rows show placeholders until it resolves
 */
export function useMovieSheetDetails(tmdbId: number | undefined) {
	return useQuery({
		queryKey: [QueryKey.MOVIE_SHEET, tmdbId],
		enabled: !!tmdbId,
		staleTime: DAY_MS,
		gcTime: DAY_MS,
		queryFn: async (): Promise<MovieSheetDetails> => {
			const cached = movieSheetFromCatalog(getCachedCatalogShow(tmdbId!, MediaType.MOVIE));
			if (cached) return cached;
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (!apiKey) throw new Error("No TMDB API key available");
			return movieSheetFromTmdb(await getShowDetails(apiKey, tmdbId!, MediaType.MOVIE));
		},
	});
}
