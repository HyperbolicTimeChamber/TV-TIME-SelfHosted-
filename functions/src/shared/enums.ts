export enum WatchStatus {
  WATCHING = "watching",
  PLAN_TO_WATCH = "plan_to_watch",
  COMPLETED = "completed",
  PAUSED = "paused",
  REWATCHING = "rewatching",
  PAUSED_REWATCH = "paused_rewatch",
}

export enum MediaType {
  TV = "tv",
  MOVIE = "movie",
}

export enum ShowStatus {
  ENDED = "Ended",
  CANCELED = "Canceled",
}

export const ENDED_STATUSES: string[] = [ShowStatus.ENDED, ShowStatus.CANCELED];

export const TMDB_BASE = "https://api.themoviedb.org/3";
export const TVMAZE_BASE = "https://api.tvmaze.com";

/** TMDB episode_type — only FINALE earns a FINALE tag (the last listed episode may not be one) */
export enum EpisodeType {
  STANDARD = "standard",
  FINALE = "finale",
  MID_SEASON = "mid_season",
}

/** Why a client asked refreshShow for fresh TMDB data — picks the dedupe window */
export enum RefreshReason {
  /** Last catalog episode has aired and isn't a finale → TMDB may list new episodes */
  AIRED_NO_FINALE = "aired_no_finale",
  /** Catalog lacks a poster / real next-episode title / movie credits */
  MISSING_DATA = "missing_data",
  /** Client's own TMDB season response differs from the catalog (proven stale) */
  STALE_SEASON = "stale_season",
}

const HOUR_MS = 60 * 60 * 1000;

/** One TMDB refresh per show per window, across all users (shows/{id}.lastTmdbCheckAt) */
export const REFRESH_COOLDOWN_MS: Record<RefreshReason, number> = {
  [RefreshReason.AIRED_NO_FINALE]: 6 * HOUR_MS,
  [RefreshReason.MISSING_DATA]: 6 * HOUR_MS,
  [RefreshReason.STALE_SEASON]: HOUR_MS / 2,
};

/** Season numbers one refreshShow call may force-refetch (the latest season always is) */
export const REFRESH_MAX_HINT_SEASONS = 3;
