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

/** deleteAccount queues the uid here; purgeUserData deletes the user's data in the background */
export const DELETION_REQUESTS = "deletionRequests";

/** gRPC status of a create() on a doc that already exists */
export const GRPC_ALREADY_EXISTS = 6;

/** Import lock lifetime: importMatches timeout (3600s) + slack, so a crashed run can't block forever */
export const IMPORT_LOCK_MS = 3660 * 1000;

/** Firestore ops per WriteBatch commit (hard limit 500) */
export const WRITE_BATCH_SIZE = 500;

/** Callable Cloud Functions guarded by requireCaller (per-user rate limit + App Check) */
export enum Callable {
  ADD_SHOW = "addShow",
  REMOVE_SHOW = "removeShow",
  IMPORT_MATCHES = "importMatches",
  MARK_SEASON_WATCHED = "markSeasonWatched",
  REBUILD_UPCOMING = "rebuildUpcoming",
  REFRESH_SHOW = "refreshShow",
  DELETE_ACCOUNT = "deleteAccount",
  TEST_FCM = "testFCM",
}

const MINUTE_MS = 60 * 1000;

/**
 * Per-user call budget per function instance (in memory — no Firestore reads). Generous for
 * real use (warmups and bursts like a watchlist refreshing many shows count too); a script
 * looping on one account gets resource-exhausted instead of occupying the capped instances.
 */
export const CALLABLE_RATE_LIMITS: Record<
  Callable,
  { limit: number; windowMs: number }
> = {
  [Callable.ADD_SHOW]: { limit: 60, windowMs: MINUTE_MS },
  [Callable.REMOVE_SHOW]: { limit: 60, windowMs: MINUTE_MS },
  [Callable.IMPORT_MATCHES]: { limit: 5, windowMs: 10 * MINUTE_MS },
  [Callable.MARK_SEASON_WATCHED]: { limit: 60, windowMs: MINUTE_MS },
  [Callable.REBUILD_UPCOMING]: { limit: 20, windowMs: MINUTE_MS },
  [Callable.REFRESH_SHOW]: { limit: 120, windowMs: MINUTE_MS },
  [Callable.DELETE_ACCOUNT]: { limit: 3, windowMs: 10 * MINUTE_MS },
  [Callable.TEST_FCM]: { limit: 5, windowMs: MINUTE_MS },
};

/** Guest TMDB proxy: uncached requests one IP may make per minute (CDN hits don't count) */
export const PROXY_IP_LIMIT = { limit: 120, windowMs: MINUTE_MS };

/** Pub/Sub topic the Cloud Billing budget publishes to — budgetGuard listens */
export const BILLING_BUDGET_TOPIC = "billing-budget";
