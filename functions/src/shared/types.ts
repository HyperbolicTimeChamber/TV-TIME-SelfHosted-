import { EpisodeType, MediaType, RefreshReason, WatchStatus, SearchScope } from "./enums";

export interface TMDBEpisode {
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  /** TMDB marks finales / mid-season finales explicitly */
  episode_type?: EpisodeType;
}

export interface TMDBSeasonDetail {
  season_number: number;
  episodes: TMDBEpisode[];
  air_date: string | null;
}

export interface TMDBShowDetail {
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
  genres?: Array<{ id: number; name: string }>;
  seasons?: Array<{
    season_number: number;
    episode_count: number;
    air_date: string | null;
    poster_path?: string | null;
  }>;
  credits?: {
    crew: Array<{ job: string; department: string; name: string }>;
  };
  images?: { logos?: TMDBLogo[] };
  external_ids?: { tvdb_id?: number | null; imdb_id?: string | null };
}

export interface TMDBLogo {
  file_path: string;
  iso_639_1: string | null;
}

export interface CatalogEpisode {
  episodeNumber: number;
  title: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  /** TMDB episode_type; absent on docs written before it was stored → treated as not a finale */
  episodeType?: EpisodeType;
  /** episodeType === FINALE (kept for older app builds that read this flag) */
  isSeasonFinale?: boolean;
  /** Exact UTC air time from TVMaze (ISO); clients turn it into their local day.
   *  Absent when TVMaze doesn't know the episode → fall back to airDate (US date) */
  airStamp?: string;
}

export interface CatalogSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  /** The season's own poster; null when TMDB has none (the show's poster stands in) */
  posterPath?: string | null;
  episodes: CatalogEpisode[];
}

export interface CatalogShow {
  tmdbId: number;
  mediaType: MediaType;
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
  genres: string[];
  /** TMDB title logo (English, else language-neutral); null = TMDB has none */
  logoPath?: string | null;
  /** TVMaze show id (cached so later syncs skip the lookup); null = not on TVMaze */
  tvmazeId?: number | null;
  credits?: {
    directors: string[];
    writers: string[];
    producers: string[];
  };
  /** Last refreshShow TMDB check (epoch ms) — dedupes refreshes across users */
  lastTmdbCheckAt?: number;
  /** refreshShow wrote this doc since the last syncCatalog → sync lists it as changed */
  refreshedSinceSync?: boolean;
}

// Import types
export interface ImportEpisode {
  season: number;
  episode: number;
  watchedAt: string;
}

export interface ImportMatch {
  tmdbId: number;
  mediaType: MediaType;
  status:
    WatchStatus.WATCHING | WatchStatus.COMPLETED | WatchStatus.PLAN_TO_WATCH;
  watchedEpisodes?: ImportEpisode[];
  movieRuntime?: number;
  movieWatchedAt?: string;
}

export interface ImportRequest {
  matches: ImportMatch[];
}

export interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
}

// removeShow types
export interface RemoveShowRequest {
  tmdbId: number;
  mediaType: MediaType;
}

// markSeasonWatched types
export interface EpisodeInput {
  episodeNumber: number;
  name: string;
  runtime: number;
}

export interface MarkSeasonRequest {
  tmdbId: number;
  seasonNumber: number;
  episodes: EpisodeInput[];
  nextEpisode: { season: number; episode: number } | null;
  nextEpisodeName: string | null;
  nextEpisodeAirDate: string | null;
  isShowComplete: boolean;
  /** Leave tracking doc untouched (mark doesn't continue the watch run) */
  skipTracking?: boolean;
  status?: WatchStatus;
  incrementRewatch?: boolean;
  /** Absolute rewatch run number to store (wins over incrementRewatch) */
  rewatchCount?: number;
  /** How long before now this batch's last episode should count as finished — set when one
   *  catch-up spans several calls (seasons / chunks), so they lay end to end, not on top of
   *  each other. 0 / missing = now */
  endOffsetMs?: number;
}

// refreshShow types
export interface RefreshShowRequest {
  tmdbId: number;
  mediaType: MediaType;
  reason: RefreshReason;
  /** Seasons the client knows are stale (e.g. its next episode's season) */
  seasons?: number[];
}

export interface RefreshShowResponse {
  /** True when this call fetched TMDB and wrote the doc */
  refreshed: boolean;
  /** Current catalog doc (without trackedBy); null when no doc exists */
  catalog: Omit<CatalogShow, "trackedBy"> | null;
}

// searchTitles types
export interface SearchTitlesRequest {
  query: string;
  scope: SearchScope;
  /** 1-based; batch n covers TMDB pages (n-1)*SEARCH_PAGES_PER_BATCH+1 … n*SEARCH_PAGES_PER_BATCH */
  batch: number;
}

/** A TMDB search result as TMDB sends it, media_type always set */
export type SearchTitle = Record<string, unknown> & {
  id: number;
  media_type: MediaType;
};

export interface SearchTitlesResponse {
  /** This batch's TV shows + movies in TMDB relevance order, deduped, no people */
  results: SearchTitle[];
  batch: number;
  totalBatches: number;
  totalResults: number;
}
