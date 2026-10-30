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
  SEARCH_TITLES = "searchTitles",
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
  // A search + a few "load more" batches; typing doesn't call it (suggestions stay client-side).
  // Per uid, or per IP for logged-out visitors
  [Callable.SEARCH_TITLES]: { limit: 30, windowMs: MINUTE_MS },
};

/** Guest TMDB proxy: uncached requests one IP may make per minute (CDN hits don't count) */
export const PROXY_IP_LIMIT = { limit: 120, windowMs: MINUTE_MS };

/** Pub/Sub topic the Cloud Billing budget publishes to — budgetGuard listens */
export const BILLING_BUDGET_TOPIC = "billing-budget";

/**
 * Mixpanel is configured per Firebase project in functions/.env.<projectId> (gitignored):
 * MIXPANEL_TOKEN, MIXPANEL_SERVER_URL (host, same value as the clients'). No token → nothing is
 * sent, so a fork or a leaked deploy never reports into this project's Mixpanel
 */
export const MIXPANEL_DEFAULT_SERVER_URL = "https://api.mixpanel.com";

/** Mixpanel events sent from the backend (names match the app's AnalyticsEvent) */
export enum AnalyticsEvent {
  FIRESTORE_OPS = "firestore_ops",
  FUNCTION_INVOKED = "function_invoked",
}

/** Where an event / request came from (mirrors the app's ClientPlatform) */
export enum ClientPlatform {
  APP = "app",
  WEB = "web",
  CLOUD_FUNCTION = "cloud_function",
  SCRIPT = "script",
  /** Scheduled / triggered work no client asked for */
  SYSTEM = "system",
  UNKNOWN = "unknown",
}

/** Cloud Function names as reported to Mixpanel (match the exported names) */
export enum FunctionName {
  ADD_SHOW = "addShow",
  REMOVE_SHOW = "removeShow",
  IMPORT_MATCHES = "importMatches",
  SYNC_CATALOG = "syncCatalog",
  MARK_SEASON_WATCHED = "markSeasonWatched",
  TEST_FCM = "testFCM",
  DELETE_ACCOUNT = "deleteAccount",
  PURGE_USER_DATA = "purgeUserData",
  REBUILD_UPCOMING = "rebuildUpcoming",
  TMDB_PROXY = "tmdbProxy",
  SHARE_PREVIEW = "sharePreview",
  REFRESH_SHOW = "refreshShow",
  BUDGET_GUARD = "budgetGuard",
  SEARCH_TITLES = "searchTitles",
}

/** searchTitles scope: TMDB's /search/multi, /search/tv or /search/movie */
export enum SearchScope {
  ALL = "all",
  TV = "tv",
  MOVIE = "movie",
}

/** /search/multi also returns people — searchTitles keeps only these */
export const SEARCH_MEDIA_TYPES: string[] = [MediaType.TV, MediaType.MOVIE];

/**
 * searchTitles: TMDB pages fetched per call. Clients sort the whole batch, so a sort is exact
 * across its ~100 results (TMDB only sorts search results by relevance)
 */
export const SEARCH_PAGES_PER_BATCH = 5;
/** TMDB serves at most this many search pages */
export const SEARCH_MAX_TMDB_PAGE = 500;
export const SEARCH_MAX_QUERY_LENGTH = 100;
/**
 * TMDB requests/second searchTitles may make. It runs as one instance, so this is global;
 * tmdbProxy has its own 35/s and TMDB allows ~40-50/s per IP, so keep well under that
 */
export const SEARCH_TMDB_RATE_LIMIT = 20;
/** Longest a TMDB request may queue for its slot before the search fails as busy */
export const SEARCH_MAX_QUEUE_WAIT_MS = 8000;
/** Same query + scope + batch within this window → served from memory, 0 TMDB calls */
export const SEARCH_CACHE_TTL_MS = HOUR_MS;
/** Cached batches kept per instance (oldest dropped first) */
export const SEARCH_CACHE_MAX_ENTRIES = 500;
