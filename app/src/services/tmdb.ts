import axios from "axios";
import { TMDBShow, TMDBEpisode, UpcomingEpisode } from "../types";

const TMDB_BASE = "https://api.themoviedb.org/3";

function tmdb(apiKey: string) {
  return axios.create({
    baseURL: TMDB_BASE,
    params: { api_key: apiKey },
  });
}

export async function searchMulti(apiKey: string, query: string, page: number = 1) {
  const res = await tmdb(apiKey).get("/search/multi", {
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

export async function getUpcomingEpisodes(apiKey: string, tmdbIds: number[]) {
  const results = await Promise.all(
    tmdbIds.map(async (id) => {
      try {
        const res = await tmdb(apiKey).get(`/tv/${id}`);
        const show = res.data;
        if (!show.next_episode_to_air) return null;
        const ep = show.next_episode_to_air;
        return {
          tmdbShowId: id,
          showTitle: show.name,
          posterPath: show.poster_path,
          season: ep.season_number,
          episode: ep.episode_number,
          episodeTitle: ep.name,
          airDate: ep.air_date,
          runtime: ep.runtime ?? null,
        } as UpcomingEpisode;
      } catch {
        return null;
      }
    })
  );
  return { episodes: results.filter((e): e is UpcomingEpisode => e !== null) };
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await tmdb(apiKey).get("/configuration");
    return true;
  } catch {
    return false;
  }
}
