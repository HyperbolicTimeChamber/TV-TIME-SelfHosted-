import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSeasonDetails } from "../services";
import { useAuthStore } from "../stores";
import { QueryKey, type CarouselEpisode } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Season episodes for a read-only episode info modal (Watch List, Upcoming, Calendar): overviews /
 * stills from TMDB — the stored catalog often has no overview for new episodes. Goes through the
 * show page's season query cache (same key), so a season is fetched once a day; no Firestore
 * reads (the cached catalog already filled the modal, and stays on failure).
 */
export async function loadSeasonEpisodes(
	queryClient: QueryClient,
	tmdbId: number | null | undefined,
	season: number,
): Promise<CarouselEpisode[] | null> {
	const apiKey = useAuthStore.getState().appTmdbApiKey;
	if (!apiKey || !tmdbId) return null;
	try {
		const seasonData = await queryClient.fetchQuery({
			queryKey: [QueryKey.SEASON_IMAGES, tmdbId, season],
			queryFn: () => getSeasonDetails(apiKey, tmdbId, season),
			staleTime: DAY_MS,
			// Kept as long as it's fresh — the 5 min default dropped an unwatched season early and the
			// next open fetched it again
			gcTime: DAY_MS,
		});
		return seasonData.episodes.map((e) => ({
			season: e.season_number ?? season,
			episode: e.episode_number,
			title: e.name || null,
			airDate: e.air_date || null,
			runtime: e.runtime || null,
			stillPath: e.still_path || null,
			overview: e.overview || null,
		}));
	} catch {
		// Offline etc. — the modal keeps what the cached catalog gave
		return null;
	}
}

/** loadSeasonEpisodes bound to one show (Calendar's info modal) */
export function useEpisodeInfoLoader(tmdbId: number | null | undefined) {
	const queryClient = useQueryClient();
	return useCallback(
		(season: number) => loadSeasonEpisodes(queryClient, tmdbId, season),
		[queryClient, tmdbId],
	);
}
