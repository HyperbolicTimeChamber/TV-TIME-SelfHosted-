import { Timestamp } from "@react-native-firebase/firestore";
import { getCachedCatalogShow } from "../../hooks/useWatchlist";
import { getSeasonDetails } from "../../services";
import { showDocId } from "../../utils/docId";
import type { EnrichedTrackingItem } from "../../hooks/useWatchlist";
import { MediaType, WatchStatus, CatalogShow } from "../../types";

export interface EpInfo {
	name: string | null;
	airDate: string | null;
	runtime: number | null;
	catalog: CatalogShow | null;
	tmdbEpisodes: Array<{
		season: number;
		episode: number;
		name: string;
		airDate: string | null;
		runtime: number | null;
	}>;
}

/** Fetch episode info from local catalog cache or TMDB. 0 Firestore reads. */
export async function fetchFirstEpisodeInfo(
	tmdbId: number,
	apiKey: string | null,
): Promise<EpInfo> {
	const cached = getCachedCatalogShow(tmdbId, MediaType.TV);
	if (cached?.seasons?.length) {
		const s1 = cached.seasons.find((s) => s.seasonNumber === 1);
		const ep1 = s1?.episodes?.find((e) => e.episodeNumber === 1);
		if (ep1) {
			return {
				name: ep1.title || null,
				airDate: ep1.airDate || null,
				runtime: ep1.runtime || null,
				catalog: cached,
				tmdbEpisodes: [],
			};
		}
	}

	if (apiKey) {
		try {
			const season = await getSeasonDetails(apiKey, tmdbId, 1);
			const eps = season?.episodes ?? [];
			const ep1 = eps.find((e) => e.episode_number === 1);
			const tmdbEpisodes = eps.map((e) => ({
				season: 1,
				episode: e.episode_number,
				name: e.name || "",
				airDate: e.air_date || null,
				runtime: e.runtime ?? null,
			}));
			const minimalCatalog: CatalogShow = {
				tmdbId,
				mediaType: MediaType.TV,
				title: "",
				posterPath: null,
				backdropPath: null,
				overview: "",
				status: "",
				totalSeasons: 1,
				totalEpisodes: eps.length,
				runtime: null,
				voteAverage: 0,
				firstAirDate: null,
				releaseDate: null,
				seasons: [
					{
						seasonNumber: 1,
						episodeCount: eps.length,
						airDate: (season as any)?.air_date || null,
						episodes: eps.map((e) => ({
							episodeNumber: e.episode_number,
							title: e.name || "",
							overview: e.overview || "",
							airDate: e.air_date || null,
							runtime: e.runtime ?? null,
							stillPath: e.still_path || null,
						})),
					},
				],
				trackedBy: [],
				trackedByCount: 0,
				lastSyncedAt: null,
			};
			return {
				name: ep1?.name || null,
				airDate: ep1?.air_date || null,
				runtime: ep1?.runtime || null,
				catalog: minimalCatalog,
				tmdbEpisodes,
			};
		} catch {}
	}

	return { name: null, airDate: null, runtime: null, catalog: null, tmdbEpisodes: [] };
}

export function buildOptimisticItem(
	tmdbId: number,
	mediaType: MediaType,
	title: string,
	posterPath: string | null,
	nextEpisode: { season: number; episode: number } | null,
	nextEpisodeName: string | null,
	nextEpisodeAirDate: string | null,
	catalog: CatalogShow | null,
	releaseDate?: string | null,
): EnrichedTrackingItem {
	const now = Timestamp.now();
	return {
		id: showDocId(tmdbId, mediaType),
		tmdbId,
		mediaType,
		status: WatchStatus.WATCHING,
		nextEpisode,
		nextEpisodeName,
		nextEpisodeAirDate,
		rewatchCount: 0,
		addedAt: now,
		lastWatchedAt: now,
		priorityDate: now,
		releaseDate: releaseDate ?? null,
		title,
		posterPath,
		totalEpisodes: catalog?.totalEpisodes ?? 0,
		catalogShow: catalog,
	};
}
