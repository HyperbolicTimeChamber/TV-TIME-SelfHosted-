import axios from "axios";
import { TMDBShow, TMDBEpisode } from "../types";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdb(apiKey: string) {
  return axios.create({
    baseURL: TMDB_BASE,
    params: { api_key: apiKey },
  });
}

export async function searchMulti(
  apiKey: string,
  query: string,
  page: number = 1,
  mediaType?: "all" | "tv" | "movie",
) {
  const endpoint = mediaType === "tv"
    ? "/search/tv"
    : mediaType === "movie"
      ? "/search/movie"
      : "/search/multi";
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
  timeWindow: string = "week"
) {
  const res = await tmdb(apiKey).get(`/trending/${mediaType}/${timeWindow}`);
  return {
    results: res.data.results as TMDBShow[],
    page: res.data.page as number,
    totalPages: res.data.total_pages as number,
  };
}

export async function getShowDetails(
  apiKey: string,
  tmdbId: number,
  mediaType: string = "tv"
) {
  const res = await tmdb(apiKey).get(`/${mediaType}/${tmdbId}`, {
    params: { append_to_response: "credits,similar" },
  });
  return res.data as TMDBShow;
}

export async function getSeasonDetails(
  apiKey: string,
  tmdbId: number,
  seasonNumber: number
) {
  const res = await tmdb(apiKey).get(`/tv/${tmdbId}/season/${seasonNumber}`);
  return res.data as { episodes: TMDBEpisode[]; name: string; season_number: number };
}

export async function discoverTVByAirDate(
  apiKey: string,
  startDate: string,
  endDate: string
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

