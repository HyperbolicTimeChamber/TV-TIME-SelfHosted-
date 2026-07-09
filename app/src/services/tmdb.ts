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

export interface ShowSeasonInfo {
  tmdbId: number;
  showTitle: string;
  posterPath: string | null;
  currentSeason: number;
  totalSeasons: number;
}

export async function getShowSeasonInfos(apiKey: string, tmdbIds: number[]): Promise<ShowSeasonInfo[]> {
  const tasks = tmdbIds.map((id) => async (): Promise<ShowSeasonInfo | null> => {
    try {
      const res = await tmdb(apiKey).get(`/tv/${id}`);
      const show = res.data;
      const nextEp = show.next_episode_to_air;
      const lastEp = show.last_episode_to_air;
      const seasonNum = nextEp?.season_number ?? lastEp?.season_number;
      if (!seasonNum) return null;
      return {
        tmdbId: id,
        showTitle: show.name,
        posterPath: show.poster_path,
        currentSeason: seasonNum,
        totalSeasons: show.number_of_seasons ?? seasonNum,
      };
    } catch {
      return null;
    }
  });
  const results = await pooled(tasks, 5);
  return results.filter((s): s is ShowSeasonInfo => s !== null);
}

export async function getSeasonEpisodes(
  apiKey: string,
  showInfo: ShowSeasonInfo,
  seasonNum: number,
  userId?: string
): Promise<UpcomingEpisode[]> {
  // Check Firebase cache first
  if (userId) {
    try {
      const { getCachedSeason } = await import("./firestore");
      const cached = await getCachedSeason(userId, showInfo.tmdbId, seasonNum);
      if (cached) return cached.episodes;
    } catch {}
  }

  try {
    const res = await tmdb(apiKey).get(`/tv/${showInfo.tmdbId}/season/${seasonNum}`);
    const episodes = res.data.episodes || [];
    const mapped: UpcomingEpisode[] = episodes
      .filter((ep: any) => ep.air_date)
      .map((ep: any) => ({
        tmdbShowId: showInfo.tmdbId,
        showTitle: showInfo.showTitle,
        posterPath: showInfo.posterPath,
        season: ep.season_number,
        episode: ep.episode_number,
        episodeTitle: ep.name,
        airDate: ep.air_date,
        runtime: ep.runtime ?? null,
      }));

    // Cache in Firebase
    if (userId && mapped.length > 0) {
      try {
        const { setCachedSeason } = await import("./firestore");
        await setCachedSeason(userId, showInfo.tmdbId, seasonNum, mapped);
      } catch {}
    }

    return mapped;
  } catch {
    return [];
  }
}

export async function getUpcomingEpisodes(apiKey: string, tmdbIds: number[]) {
  const infos = await getShowSeasonInfos(apiKey, tmdbIds);
  const results = await Promise.all(
    infos.map((info) => getSeasonEpisodes(apiKey, info, info.currentSeason))
  );
  return { episodes: results.flat(), showInfos: infos };
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await tmdb(apiKey).get("/configuration");
    return true;
  } catch {
    return false;
  }
}
