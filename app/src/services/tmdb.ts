import axios from "axios";
import { TMDBShow, TMDBEpisode } from "../types";
import { logApiCall } from "./analytics";
import { TMDB_API_BASE as TMDB_BASE, TMDB_PROXY_BASE, TMDB_PROXY_KEY } from "../enums";

/** Extra headers for proxy requests (web registers its App Check token here) */
type HeaderProvider = () => Promise<Record<string, string>>;
let proxyHeaders: HeaderProvider | null = null;
export function setTmdbProxyHeaders(provider: HeaderProvider | null) {
	proxyHeaders = provider;
}

function tmdb(apiKey: string) {
	// Logged-out web visitors have no key: same paths, served by the tmdbProxy CF
	const viaProxy = apiKey === TMDB_PROXY_KEY;
	const instance = axios.create({
		baseURL: viaProxy ? TMDB_PROXY_BASE : TMDB_BASE,
		params: viaProxy ? {} : { api_key: apiKey },
	});
	if (viaProxy && proxyHeaders) {
		const provider = proxyHeaders;
		instance.interceptors.request.use(async (config) => {
			const extra = await provider().catch(() => ({}));
			for (const [k, v] of Object.entries(extra)) config.headers.set(k, v);
			return config;
		});
	}
	instance.interceptors.request.use((config) => {
		(config as any)._startTime = Date.now();
		return config;
	});
	instance.interceptors.response.use(
		(response) => {
			const start = (response.config as any)._startTime ?? Date.now();
			const path = response.config.url?.replace(TMDB_BASE, "") ?? "";
			logApiCall({
				api_type: "tmdb",
				method: path,
				success: true,
				duration_ms: Date.now() - start,
			});
			return response;
		},
		(error) => {
			const start = (error.config as any)?._startTime ?? Date.now();
			const path = error.config?.url?.replace(TMDB_BASE, "") ?? "";
			logApiCall({
				api_type: "tmdb",
				method: path,
				success: false,
				duration_ms: Date.now() - start,
				error: error?.message,
			});
			return Promise.reject(error);
		},
	);
	return instance;
}

export async function searchMulti(
	apiKey: string,
	query: string,
	page: number = 1,
	mediaType?: "all" | "tv" | "movie",
) {
	const endpoint =
		mediaType === "tv" ? "/search/tv" : mediaType === "movie" ? "/search/movie" : "/search/multi";
	const res = await tmdb(apiKey).get(endpoint, {
		params: { query, page },
	});
	return {
		results: res.data.results as TMDBShow[],
		page: res.data.page as number,
		totalPages: res.data.total_pages as number,
		totalResults: res.data.total_results as number,
	};
}

export async function getTrending(
	apiKey: string,
	mediaType: string = "tv",
	timeWindow: string = "week",
) {
	const res = await tmdb(apiKey).get(`/trending/${mediaType}/${timeWindow}`);
	return {
		results: res.data.results as TMDBShow[],
		page: res.data.page as number,
		totalPages: res.data.total_pages as number,
	};
}

export async function searchSuggestions(apiKey: string, query: string): Promise<string[]> {
	const res = await tmdb(apiKey).get("/search/multi", {
		params: { query, page: 1 },
	});
	const seen = new Set<string>();
	const names: string[] = [];
	for (const item of res.data.results) {
		const name = (item.name || item.title || "").trim();
		const lower = name.toLowerCase();
		if (name && !seen.has(lower)) {
			seen.add(lower);
			names.push(name);
		}
		if (names.length >= 8) break;
	}
	return names;
}

export async function getShowDetails(apiKey: string, tmdbId: number, mediaType: string = "tv") {
	// Title logos ride along on the same request (the show page's logo comes with its data).
	// Not via the guest proxy yet: the deployed proxy rejects append values it doesn't know
	const viaProxy = apiKey === TMDB_PROXY_KEY;
	const res = await tmdb(apiKey).get(`/${mediaType}/${tmdbId}`, {
		params: viaProxy
			? { append_to_response: "credits,similar" }
			: { append_to_response: "credits,similar,images", include_image_language: "en,null" },
	});
	return res.data as TMDBShow;
}

type TmdbLogo = { file_path: string; iso_639_1: string | null };

/** Best title logo — English, else language-neutral (same pick as the catalog's logoPath) */
export function pickTitleLogo(logos: TmdbLogo[] | undefined | null): string | null {
	return (
		logos?.find((l) => l.iso_639_1 === "en")?.file_path ??
		logos?.find((l) => !l.iso_639_1)?.file_path ??
		null
	);
}

/** Title logo on its own (for titles whose details weren't fetched with images) */
export async function getTitleLogo(
	apiKey: string,
	tmdbId: number,
	mediaType: string,
): Promise<string | null> {
	const res = await tmdb(apiKey).get(`/${mediaType}/${tmdbId}/images`, {
		params: { include_image_language: "en,null" },
	});
	return pickTitleLogo(res.data?.logos);
}

export async function getSeasonDetails(apiKey: string, tmdbId: number, seasonNumber: number) {
	const res = await tmdb(apiKey).get(`/tv/${tmdbId}/season/${seasonNumber}`);
	return res.data as {
		episodes: TMDBEpisode[];
		name: string;
		season_number: number;
	};
}

export async function discoverTVByAirDate(
	apiKey: string,
	startDate: string,
	endDate: string,
): Promise<number[]> {
	const ids: number[] = [];
	let page = 1;
	let totalPages = 1;

	while (page <= totalPages && page <= 5) {
		const res = await tmdb(apiKey).get("/discover/tv", {
			params: {
				"air_date.gte": startDate,
				"air_date.lte": endDate,
				page,
			},
		});
		for (const show of res.data.results) {
			ids.push(show.id);
		}
		totalPages = res.data.total_pages;
		page++;
	}

	return ids;
}

export interface DiscoverMovie {
	id: number;
	title: string;
	poster_path: string | null;
	release_date: string;
}

export async function discoverMoviesByReleaseDate(
	apiKey: string,
	startDate: string,
	endDate: string,
): Promise<DiscoverMovie[]> {
	const movies: DiscoverMovie[] = [];
	let page = 1;
	let totalPages = 1;

	while (page <= totalPages && page <= 5) {
		const res = await tmdb(apiKey).get("/discover/movie", {
			params: {
				"primary_release_date.gte": startDate,
				"primary_release_date.lte": endDate,
				page,
			},
		});
		for (const m of res.data.results) {
			movies.push({
				id: m.id,
				title: m.title,
				poster_path: m.poster_path,
				release_date: m.release_date,
			});
		}
		totalPages = res.data.total_pages;
		page++;
	}

	return movies;
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
