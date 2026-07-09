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

export interface ShowSeasonInfo {
  tmdbId: number;
  showTitle: string;
  posterPath: string | null;
  currentSeason: number;
  totalSeasons: number;
}

export async function getShowSeasonInfos(apiKey: string, tmdbIds: number[]): Promise<ShowSeasonInfo[]> {
  const results = await Promise.all(
    tmdbIds.map(async (id) => {
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
        } as ShowSeasonInfo;
      } catch {
        return null;
      }
    })
  );
  return results.filter((s): s is ShowSeasonInfo => s !== null);
}

export async function getSeasonEpisodes(
  apiKey: string,
  showInfo: ShowSeasonInfo,
  seasonNum: number
): Promise<UpcomingEpisode[]> {
  try {
    const res = await tmdb(apiKey).get(`/tv/${showInfo.tmdbId}/season/${seasonNum}`);
    const episodes = res.data.episodes || [];
    return episodes
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
