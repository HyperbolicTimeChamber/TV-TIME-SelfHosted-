import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { TMDBShow, TMDBEpisode } from "../types";
import { CloudFunction } from "../enums";

const proxy = httpsCallable(getFunctions(), CloudFunction.TMDB_PROXY);

async function call(data: Record<string, unknown>) {
	const res = await proxy(data);
	return res.data as Record<string, any>;
}

/** Warmup the proxy CF (call on screen mount) */
export function warmupTmdbProxy() {
	proxy({ warmup: true }).catch(() => {});
}

export async function searchMulti(
	query: string,
	page: number = 1,
	mediaType?: "all" | "tv" | "movie",
) {
	const data = await call({ action: "search", query, page, mediaType });
	return {
		results: data.results as TMDBShow[],
		page: data.page as number,
		totalPages: data.totalPages as number,
		totalResults: data.totalResults as number,
	};
}

export async function getTrending(mediaType: string = "tv", timeWindow: string = "week") {
	const data = await call({ action: "trending", mediaType, timeWindow });
	return {
		results: data.results as TMDBShow[],
		page: data.page as number,
		totalPages: data.totalPages as number,
	};
}

export async function searchSuggestions(query: string): Promise<string[]> {
	const data = await call({ action: "suggestions", query });
	return data.names as string[];
}

export async function getShowDetails(tmdbId: number, mediaType: string = "tv") {
	const data = await call({ action: "showDetails", tmdbId, mediaType });
	return data as unknown as TMDBShow;
}

export async function getSeasonDetails(tmdbId: number, seasonNumber: number) {
	const data = await call({ action: "seasonDetails", tmdbId, seasonNumber });
	return data as unknown as {
		episodes: TMDBEpisode[];
		name: string;
		season_number: number;
	};
}

export async function discoverTVByAirDate(startDate: string, endDate: string): Promise<number[]> {
	const data = await call({ action: "discoverTV", startDate, endDate });
	return data.ids as number[];
}

export interface DiscoverMovie {
	id: number;
	title: string;
	poster_path: string | null;
	release_date: string;
}

export async function discoverMoviesByReleaseDate(
	startDate: string,
	endDate: string,
): Promise<DiscoverMovie[]> {
	const data = await call({ action: "discoverMovies", startDate, endDate });
	return data.movies as DiscoverMovie[];
}

export async function findByTvdbId(tvdbId: number) {
	const data = await call({ action: "findByTvdbId", tvdbId });
	return {
		tvResults: data.tvResults as any[],
		movieResults: data.movieResults as any[],
	};
}

export async function pooled<T>(tasks: (() => Promise<T>)[], concurrency = 5): Promise<T[]> {
	const results: T[] = [];
	let i = 0;
	async function next(): Promise<void> {
		while (i < tasks.length) {
			const idx = i++;
			results[idx] = await tasks[idx]();
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => next()));
	return results;
}
