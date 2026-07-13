import axios from "axios";

const TMDB_BASE = "https://api.themoviedb.org/3";

interface TMDBEpisode {
  episode_number: number;
  name: string;
  air_date: string | null;
  runtime: number | null;
}

interface TMDBSeasonDetail {
  season_number: number;
  episodes: TMDBEpisode[];
  air_date: string | null;
}

interface TMDBShowDetail {
  id: number;
  name?: string;
  title?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  status: string;
  number_of_seasons?: number;
  number_of_episodes?: number;
  runtime?: number | null;
  episode_run_time?: number[];
  first_air_date?: string;
  release_date?: string;
  vote_average: number;
  seasons?: Array<{
    season_number: number;
    episode_count: number;
    air_date: string | null;
  }>;
}

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  airDate: string | null;
  runtime: number | null;
}

export interface CatalogSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogShow {
  tmdbId: number;
  mediaType: "tv" | "movie";
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  status: string;
  totalSeasons: number;
  totalEpisodes: number;
  runtime: number | null;
  voteAverage: number;
  firstAirDate: string | null;
  releaseDate: string | null;
  seasons: CatalogSeason[];
}

export async function pooled<T>(
  tasks: (() => Promise<T>)[],
  concurrency = 5
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

async function fetchSeasonEpisodes(
  apiKey: string,
  tmdbId: number,
  seasonNumber: number
): Promise<CatalogSeason> {
  const { data } = await axios.get<TMDBSeasonDetail>(
    `${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`,
    { params: { api_key: apiKey } }
  );
  return {
    seasonNumber: data.season_number,
    episodeCount: data.episodes.length,
    airDate: data.air_date,
    episodes: data.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      title: ep.name,
      airDate: ep.air_date,
      runtime: ep.runtime,
    })),
  };
}

export async function fetchShowFromTMDB(
  apiKey: string,
  tmdbId: number,
  mediaType: "tv" | "movie"
): Promise<CatalogShow> {
  const endpoint =
    mediaType === "tv"
      ? `${TMDB_BASE}/tv/${tmdbId}`
      : `${TMDB_BASE}/movie/${tmdbId}`;

  const { data } = await axios.get<TMDBShowDetail>(endpoint, {
    params: { api_key: apiKey },
  });

  let seasons: CatalogSeason[] = [];
  let totalEpisodes = data.number_of_episodes ?? 0;
  let totalSeasons = data.number_of_seasons ?? 0;

  if (mediaType === "tv" && data.seasons) {
    const seasonNumbers = data.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => s.season_number);

    const tasks = seasonNumbers.map(
      (num) => () => fetchSeasonEpisodes(apiKey, tmdbId, num)
    );
    seasons = await pooled(tasks, 5);
    totalEpisodes = seasons.reduce((sum, s) => sum + s.episodeCount, 0);
    totalSeasons = seasons.length;
  }

  const avgRuntime =
    mediaType === "movie"
      ? data.runtime ?? null
      : data.episode_run_time?.[0] ?? null;

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
  };
}
