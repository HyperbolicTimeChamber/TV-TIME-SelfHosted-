import { useQuery } from "@tanstack/react-query";
import { getShowDetails } from "../services";
import { getCachedCatalogShow } from "./useWatchlist";
import { useAuthStore } from "../stores";
import { MediaType, QueryKey } from "../types";
import { ENDED_STATUSES } from "../enums";

const airingOf = (mediaType: MediaType, status: string | undefined | null) =>
	mediaType === MediaType.TV && status
		? ENDED_STATUSES.includes(status)
			? "Ended"
			: "Ongoing"
		: null;

export interface TitleInfo {
	totalEpisodes: number | null;
	/** Minutes: a movie's runtime / a show's usual episode length */
	runtime: number | null;
	/** List cards' backdrop */
	backdropPath: string | null;
	/** First air / release year ("2024") */
	year: string | null;
	/** TV: season count (the list card's square) */
	totalSeasons: number | null;
	/** TV: "Ongoing" / "Ended" once TMDB says; null for movies / unknown */
	airing: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Episode count, runtime, backdrop and year of one title — what a list page's List view card shows. The shared
 * catalog cache answers when it can; otherwise one TMDB call (no Firestore read), kept for a day.
 * `enabled` lets a caller skip it (Grid view shows none of this).
 */
export function useTitleInfo(tmdbId: number, mediaType: MediaType, enabled = true) {
	return useQuery({
		queryKey: [QueryKey.TITLE_INFO, tmdbId, mediaType],
		enabled,
		staleTime: DAY_MS,
		gcTime: DAY_MS,
		queryFn: async (): Promise<TitleInfo> => {
			const cached = getCachedCatalogShow(tmdbId, mediaType);
			if (cached && !cached.partial && cached.title) {
				return {
					totalEpisodes: cached.totalEpisodes || null,
					runtime: cached.runtime ?? null,
					backdropPath: cached.backdropPath ?? null,
					year: (cached.firstAirDate ?? cached.releaseDate)?.slice(0, 4) || null,
					totalSeasons: mediaType === MediaType.TV ? cached.totalSeasons || null : null,
					airing: airingOf(mediaType, cached.status),
				};
			}
			const apiKey = useAuthStore.getState().appTmdbApiKey;
			if (!apiKey) throw new Error("No TMDB API key available");
			const details = await getShowDetails(apiKey, tmdbId, mediaType);
			const episodeRunTime = (details as { episode_run_time?: number[] }).episode_run_time;
			return {
				totalEpisodes: mediaType === MediaType.TV ? (details.number_of_episodes ?? null) : null,
				runtime: details.runtime ?? episodeRunTime?.[0] ?? null,
				backdropPath: details.backdrop_path ?? null,
				year: (details.first_air_date ?? details.release_date)?.slice(0, 4) || null,
				totalSeasons: mediaType === MediaType.TV ? (details.number_of_seasons ?? null) : null,
				airing: airingOf(mediaType, details.status),
			};
		},
	});
}
