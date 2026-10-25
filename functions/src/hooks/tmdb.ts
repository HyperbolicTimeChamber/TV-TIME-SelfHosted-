import axios from "axios";
import { EpisodeType, MediaType, TMDB_BASE, ENDED_STATUSES } from "../shared/enums";
import { applyAirStamps, fetchTvmazeAirStamps, lookupTvmazeId, needsAirStamps } from "./tvmaze";
import {
  CatalogShow,
  CatalogSeason,
  TMDBSeasonDetail,
  TMDBShowDetail,
  TMDBLogo,
} from "../shared/types";

export { CatalogShow, CatalogSeason };
export type {
  CatalogEpisode,
  TMDBEpisode,
  TMDBSeasonDetail,
  TMDBShowDetail,
  TMDBLogo,
} from "../shared/types";

export async function pooled<T>(
  tasks: (() => Promise<T>)[],
  concurrency = 5,
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
    () => worker(),
  );
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
    episodes: data.episodes.map((ep) => ({
      episodeNumber: ep.episode_number,
      title: ep.name,
      overview: ep.overview ?? "",
      airDate: ep.air_date,
      runtime: ep.runtime,
      stillPath: ep.still_path ?? null,
      // Only TMDB's explicit marker counts — the last listed episode is often just the latest
      ...(ep.episode_type ? { episodeType: ep.episode_type } : {}),
      isSeasonFinale: ep.episode_type === EpisodeType.FINALE,
    })),
  };
}

/**
 * Seasons a partial refresh must re-fetch: forced ones, ones the stored doc lacks, and ones
 * whose TMDB episode count no longer matches. Everything else reuses the stored season.
 */
export function seasonsToFetch(
  listed: Array<{ season_number: number; episode_count: number }>,
  stored: Array<Pick<CatalogSeason, "seasonNumber" | "episodeCount">>,
  forced: number[],
): number[] {
  const storedCounts = new Map(stored.map((s) => [s.seasonNumber, s.episodeCount]));
  return listed
    .filter((s) => s.season_number > 0)
    .filter(
      (s) =>
        forced.includes(s.season_number) ||
        storedCounts.get(s.season_number) !== s.episode_count,
    )
    .map((s) => s.season_number);
}

/**
 * Premiere date: TMDB's first_air_date, else the earliest regular season's air date, else the
 * earliest episode air date — TMDB sometimes leaves first_air_date empty for new shows.
 * Season 0 (specials) doesn't count.
 */
export function premiereDate(
  firstAirDate: string | null | undefined,
  seasons: Array<Pick<CatalogSeason, "seasonNumber" | "airDate" | "episodes">> = [],
): string | null {
  if (firstAirDate) return firstAirDate;
  const regular = seasons.filter((s) => s.seasonNumber > 0);
  const dates = regular.map((s) => s.airDate).filter((d): d is string => !!d);
  if (dates.length === 0) {
    for (const s of regular)
      for (const e of s.episodes ?? []) if (e.airDate) dates.push(e.airDate);
  }
  return dates.sort()[0] ?? null;
}

/** Best title logo: TMDB lists them best-voted first; prefer English, then language-neutral */
export function pickLogo(logos: TMDBLogo[] | undefined): string | null {
  if (!logos?.length) return null;
  return (
    logos.find((l) => l.iso_639_1 === "en")?.file_path ??
    logos.find((l) => !l.iso_639_1)?.file_path ??
    null
  );
}

export async function fetchShowStatus(
  apiKey: string,
  tmdbId: number,
): Promise<string> {
  const { data } = await axios.get<{ status: string }>(
    `${TMDB_BASE}/tv/${tmdbId}`,
    {
      params: { api_key: apiKey },
    },
  );
  return data.status ?? "Unknown";
}

export async function fetchShowFromTMDB(
  apiKey: string,
  tmdbId: number,
  mediaType: MediaType,
  /** Known TVMaze id from the stored catalog doc — skips the lookup call.
   *  With `reuseSeasons`, only `refetchSeasons` + new/resized seasons hit TMDB (refreshShow) */
  opts: {
    tvmazeId?: number | null;
    reuseSeasons?: CatalogSeason[];
    refetchSeasons?: number[];
  } = {},
): Promise<CatalogShow> {
  const endpoint =
    mediaType === MediaType.TV
      ? `${TMDB_BASE}/tv/${tmdbId}`
      : `${TMDB_BASE}/movie/${tmdbId}`;

  // Logos ride along on the same request (images + language filter)
  const { data } = await axios.get<TMDBShowDetail>(endpoint, {
    params: {
      api_key: apiKey,
      append_to_response:
        mediaType === MediaType.MOVIE ? "credits,images" : "images,external_ids",
      include_image_language: "en,null",
    },
  });

  let seasons: CatalogSeason[] = [];
  let totalEpisodes = data.number_of_episodes ?? 0;
  let totalSeasons = data.number_of_seasons ?? 0;

  if (mediaType === MediaType.TV && data.seasons) {
    const seasonNumbers = data.seasons
      .filter((s) => s.season_number > 0)
      .map((s) => s.season_number);
    const reuse = new Map((opts.reuseSeasons ?? []).map((s) => [s.seasonNumber, s]));
    const fetchSet = new Set(
      opts.reuseSeasons
        ? seasonsToFetch(data.seasons, opts.reuseSeasons, opts.refetchSeasons ?? [])
        : seasonNumbers,
    );

    const tasks = seasonNumbers.map((num) => async () => {
      const kept = reuse.get(num);
      return !fetchSet.has(num) && kept ? kept : fetchSeasonEpisodes(apiKey, tmdbId, num);
    });
    seasons = await pooled(tasks, 5);
    totalEpisodes = seasons.reduce((sum, s) => sum + s.episodeCount, 0);
    totalSeasons = seasons.length;
  }

  // Exact air times (TVMaze) so each user sees an episode on their own local day —
  // only for shows with something recent/upcoming; any failure just keeps TMDB dates
  let tvmazeId = opts.tvmazeId ?? null;
  if (
    mediaType === MediaType.TV &&
    needsAirStamps(seasons, ENDED_STATUSES.includes(data.status ?? ""))
  ) {
    try {
      tvmazeId ??= data.external_ids ? await lookupTvmazeId(data.external_ids) : null;
      if (tvmazeId) applyAirStamps(seasons, await fetchTvmazeAirStamps(tvmazeId));
    } catch (err) {
      console.warn(`TVMaze air times failed for tmdb ${tmdbId}:`, (err as Error).message);
    }
  }

  const avgRuntime =
    mediaType === MediaType.MOVIE
      ? (data.runtime ?? null)
      : (data.episode_run_time?.[0] ?? null);

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
    firstAirDate:
      mediaType === MediaType.TV ? premiereDate(data.first_air_date, seasons) : null,
    releaseDate: data.release_date ?? null,
    seasons,
    genres: (data.genres ?? []).map((g) => g.name),
    logoPath: pickLogo(data.images?.logos),
    ...(mediaType === MediaType.TV ? { tvmazeId } : {}),
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
