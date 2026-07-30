import axios from "axios";
import { MediaType, TMDB_BASE } from "../shared/enums";
import { CatalogShow, CatalogSeason, TMDBSeasonDetail, TMDBShowDetail } from "../shared/types";

export { CatalogShow, CatalogSeason };
export type {
	CatalogEpisode,
	TMDBEpisode,
	TMDBSeasonDetail,
	TMDBShowDetail,
} from "../shared/types";

export async function pooled<T>(tasks: (() => Promise<T>)[], concurrency = 5): Promise<T[]> {
	const results: T[] = [];
	let index = 0;

	async function worker() {
		while (index < tasks.length) {
			const i = index++;
			results[i] = await tasks[i]();
		}
	}

	const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
	await Promise.all(workers);
	return results;
}

async function fetchSeasonEpisodes(
	apiKey: string,
	tmdbId: number,
	seasonNumber: number,
): Promise<CatalogSeason> {
	const { data } = await axios.get<TMDBSeasonDetail>(
		`${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`,
		{ params: { api_key: apiKey } },
	);
	return {
		seasonNumber: data.season_number,
		episodeCount: data.episodes.length,
		airDate: data.air_date,
		episodes: data.episodes.map((ep, _idx, arr) => ({
			episodeNumber: ep.episode_number,
			title: ep.name,
			overview: ep.overview ?? "",
			airDate: ep.air_date,
			runtime: ep.runtime,
			stillPath: ep.still_path ?? null,
			isSeasonFinale: ep.episode_number === arr.length,
		})),
	};
}

export async function fetchShowStatus(apiKey: string, tmdbId: number): Promise<string> {
	const { data } = await axios.get<{ status: string }>(`${TMDB_BASE}/tv/${tmdbId}`, {
		params: { api_key: apiKey },
	});
	return data.status ?? "Unknown";
}

export async function fetchShowFromTMDB(
	apiKey: string,
	tmdbId: number,
	mediaType: MediaType,
): Promise<CatalogShow> {
	const endpoint =
		mediaType === MediaType.TV ? `${TMDB_BASE}/tv/${tmdbId}` : `${TMDB_BASE}/movie/${tmdbId}`;

	const { data } = await axios.get<TMDBShowDetail>(endpoint, {
		params: {
			api_key: apiKey,
			...(mediaType === MediaType.MOVIE && { append_to_response: "credits" }),
		},
	});

	let seasons: CatalogSeason[] = [];
	let totalEpisodes = data.number_of_episodes ?? 0;
	let totalSeasons = data.number_of_seasons ?? 0;

	if (mediaType === MediaType.TV && data.seasons) {
		const seasonNumbers = data.seasons
			.filter((s) => s.season_number > 0)
			.map((s) => s.season_number);

		const tasks = seasonNumbers.map((num) => () => fetchSeasonEpisodes(apiKey, tmdbId, num));
		seasons = await pooled(tasks, 5);
		totalEpisodes = seasons.reduce((sum, s) => sum + s.episodeCount, 0);
		totalSeasons = seasons.length;
	}

	const avgRuntime =
		mediaType === MediaType.MOVIE ? (data.runtime ?? null) : (data.episode_run_time?.[0] ?? null);

	return {
		tmdbId,
		mediaType,
		title: data.name ?? data.title ?? "Unknown",
		posterPath: data.poster_path,
		backdropPath: data.backdrop_path,
		overview: data.overview ?? "",
		status: data.status ?? "Unknown",
		totalSeasons,
		totalEpisodes,
		runtime: avgRuntime,
		voteAverage: data.vote_average ?? 0,
		firstAirDate: data.first_air_date ?? null,
		releaseDate: data.release_date ?? null,
		seasons,
		genres: (data.genres ?? []).map((g) => g.name),
		...(mediaType === MediaType.MOVIE && data.credits?.crew
			? {
					credits: {
						directors: data.credits.crew
							.filter((c) => c.job === "Director")
							.map((c) => c.name),
						writers: data.credits.crew
							.filter((c) => c.department === "Writing")
							.map((c) => c.name),
						producers: data.credits.crew
							.filter((c) => c.job === "Producer")
							.map((c) => c.name)
							.slice(0, 3),
					},
				}
			: {}),
	};
}
