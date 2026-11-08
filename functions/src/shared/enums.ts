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
/** Firestore gRPC: the doc is gone / changed since the write being reacted to */
export const GRPC_NOT_FOUND = 5;
export const GRPC_FAILED_PRECONDITION = 9;

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
  EXPORT_ACCOUNT_DATA = "exportAccountData",
  CANCEL_ACCOUNT_JOB = "cancelAccountJob",
  WATCH_PROVIDERS = "watchProviders",
  TITLE_EXTRAS = "titleExtras",
  TITLE_CAST_PAGE = "titleCastPage",
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
  // A full export reads every watched episode (tens of thousands of docs); narrowed exports
  // (Settings → Export's options) read far less — room for a few of those, or a cancel + retry
  [Callable.EXPORT_ACCOUNT_DATA]: { limit: 6, windowMs: 10 * MINUTE_MS },
  // One per cancelled export (each export is rate limited above)
  [Callable.CANCEL_ACCOUNT_JOB]: { limit: 10, windowMs: 10 * MINUTE_MS },
  // One per info page opened (titles already stored never call it). Per uid, or per IP for guests
  [Callable.WATCH_PROVIDERS]: { limit: 60, windowMs: MINUTE_MS },
  // One per info page missing any of its extras (titles with everything stored never call it)
  [Callable.TITLE_EXTRAS]: { limit: 60, windowMs: MINUTE_MS },
  // The full cast sheet, a page at a time as it scrolls
  [Callable.TITLE_CAST_PAGE]: { limit: 120, windowMs: MINUTE_MS },
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
  EXPORT_ACCOUNT_DATA = "exportAccountData",
  CANCEL_ACCOUNT_JOB = "cancelAccountJob",
  ROLLBACK_CANCELLED_IMPORT = "rollbackCancelledImport",
  TRACKING_SYNC_STAMP = "trackingSyncStamp",
  WATCH_PROVIDERS = "watchProviders",
  TITLE_EXTRAS = "titleExtras",
  TITLE_CAST_PAGE = "titleCastPage",
  SEND_TEST_PUSH = "sendTestPush",
}

/**
 * Info page extras (featured cast, directors, studios, Where to Watch) for titles without a
 * catalog doc — catalog titles keep them on the doc, so the page gets them with its catalog read.
 * Same doc ids as shows/
 */
export const TITLE_EXTRAS_COLLECTION = "titleExtras";
/** A title's full cast (the View All sheet, paged) — kept off the catalog doc, which every
 *  watchlist read carries. Same doc ids as shows/ */
export const TITLE_CREDITS_COLLECTION = "titleCredits";
/** TMDB requests/second the extras callables may make (each one instance → global) */
export const TITLE_EXTRAS_TMDB_RATE_LIMIT = 10;
/** TMDB's release types (a movie's release_dates, per country) */
export enum TmdbReleaseType {
  PREMIERE = 1,
  THEATRICAL_LIMITED = 2,
  THEATRICAL = 3,
  DIGITAL = 4,
  PHYSICAL = 5,
  TV = 6,
}
/** Which release counts as a movie's local one, best first (a festival premiere doesn't) */
export const LOCAL_RELEASE_TYPES = [
  TmdbReleaseType.THEATRICAL,
  TmdbReleaseType.THEATRICAL_LIMITED,
  TmdbReleaseType.DIGITAL,
  TmdbReleaseType.PHYSICAL,
  TmdbReleaseType.TV,
];
/** Featured cast on the info page row: a movie's leads (top billed)… */
export const MOVIE_LEADS = 6;
/** …a show's regulars: in at least this share of its episodes (and MIN episodes) */
export const TV_REGULAR_SHARE = 0.4;
export const TV_REGULAR_MIN_EPISODES = 3;
/** Never more featured than this; a show with no clear regulars shows its top billed this many */
export const FEATURED_CAST_MAX = 10;
export const FEATURED_CAST_FALLBACK = 6;
/** Full cast kept per title (long-running shows list hundreds) */
export const FULL_CAST_MAX = 400;
/** Cast members per page in the View All sheet */
export const CAST_PAGE_SIZE = 30;
/** Longest cast search (by name or character) the sheet may send */
export const CAST_SEARCH_MAX_LENGTH = 50;
/** A movie's writers kept for its credits */
export const WRITERS_MAX = 8;

/**
 * Where to Watch's first home for titles without a catalog doc — now kept in titleExtras/ with
 * the other extras; syncCatalog moves any doc still here over (then this can go)
 */
export const LEGACY_WATCH_PROVIDERS_COLLECTION = "watchProviders";
/** TMDB requests/second the watchProviders callable may make (one instance → global) */
export const WATCH_PROVIDERS_TMDB_RATE_LIMIT = 10;
/** Longest a watchProviders TMDB request may queue before the call fails as busy */
export const WATCH_PROVIDERS_MAX_QUEUE_WAIT_MS = 8000;
/** ISO 3166-1 country code (the region a title's services are stored under) */
export const COUNTRY_CODE = /^[A-Z]{2}$/;

/** Account export (Settings → Export My Data): which titles (mirrors the app's ExportScope) */
export enum ExportScope {
  ALL = "all",
  MOVIES = "movies",
  TV = "tv",
  /** Custom lists only — no titles, progress or history */
  LISTS = "lists",
}

/** Narrows an ExportScope (mirrors the app's ExportFilter) */
export enum ExportFilter {
  ALL = "all",
  /** Movies on the watchlist, released, not watched yet */
  MOVIES_TO_WATCH = "moviesToWatch",
  /** Movies not released yet */
  MOVIES_UPCOMING = "moviesUpcoming",
  /** Shows that ended or were cancelled */
  TV_ENDED = "tvEnded",
  /** Shows still running */
  TV_ONGOING = "tvOngoing",
}

/** What an export carries per title, beyond its id / type / name (mirrors the app's ExportPart) */
export enum ExportPart {
  /** Status, next episode, rewatch count, dates */
  PROGRESS = "progress",
  /** Every watched episode / movie with its count and dates */
  HISTORY = "history",
  /** Custom lists */
  LISTS = "lists",
}

/** Account export file: format tag + version (the app's ACCOUNT_EXPORT_*) */
export const ACCOUNT_EXPORT_FORMAT = "watchloom-account";
export const ACCOUNT_EXPORT_VERSION = 2;
/** Watched episodes read per page (a cancel is checked between pages) */
export const EXPORT_EPISODE_PAGE = 2000;
/** Firestore `in` query limit */
export const FIRESTORE_IN_LIMIT = 30;
/** Admin-only markers a cancelled export / import leaves for the running job to find (jobCancels/{uid}_{jobId}) */
export const JOB_CANCELS_COLLECTION = "jobCancels";
/** Admin-only record of a Settings → Import run (importJobs/{uid}_{jobId}): what it added, so a
 *  cancel can take it all back — even once the import has finished */
export const IMPORT_JOBS_COLLECTION = "importJobs";
/** Field an import's tracking / history docs carry (its job id) — the rollback finds them by it */
export const IMPORT_JOB_FIELD = "importJob";

/** importJobs status */
export enum ImportJobStatus {
  RUNNING = "running",
  DONE = "done",
  ROLLING_BACK = "rollingBack",
  ROLLED_BACK = "rolledBack",
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
/** A title search with fewer results than this gets titles tagged with matching keywords after them */
export const SEARCH_KEYWORD_FALLBACK_BELOW = 10;
/** Best-matching TMDB keywords used for that fallback */
export const SEARCH_KEYWORD_MAX = 3;
/** TMDB genre ids the search aliases use (same id for TV and movies) */
export enum TmdbGenre {
  ANIMATION = 16,
  DRAMA = 18,
}
/**
 * Searches that name a regional genre TMDB has no keyword for ("k-drama" fuzzy-matched cdrama /
 * jdrama / drama, so generic dramas filled the list) → the most popular titles from that origin
 * country (in that genre, when there is one). Keys: the query lower-case, letters / digits only.
 * Mirrors app REGION_ALIASES (the Watch History filter) — keep both in step.
 */
type RegionAlias = { country: string; genre?: TmdbGenre; types: MediaType[] };
const KR_DRAMA: RegionAlias = { country: "KR", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const JP_DRAMA: RegionAlias = { country: "JP", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const CN_DRAMA: RegionAlias = { country: "CN", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const TW_DRAMA: RegionAlias = { country: "TW", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const TH_DRAMA: RegionAlias = { country: "TH", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const TR_DRAMA: RegionAlias = { country: "TR", genre: TmdbGenre.DRAMA, types: [MediaType.TV] };
const BOTH = [MediaType.TV, MediaType.MOVIE];
export const SEARCH_REGION_ALIASES: Record<string, RegionAlias> = {
  kdrama: KR_DRAMA,
  kdramas: KR_DRAMA,
  koreandrama: KR_DRAMA,
  koreandramas: KR_DRAMA,
  jdrama: JP_DRAMA,
  jdramas: JP_DRAMA,
  japanesedrama: JP_DRAMA,
  japanesedramas: JP_DRAMA,
  cdrama: CN_DRAMA,
  cdramas: CN_DRAMA,
  chinesedrama: CN_DRAMA,
  chinesedramas: CN_DRAMA,
  twdrama: TW_DRAMA,
  twdramas: TW_DRAMA,
  taiwanesedrama: TW_DRAMA,
  taiwanesedramas: TW_DRAMA,
  thaidrama: TH_DRAMA,
  thaidramas: TH_DRAMA,
  lakorn: TH_DRAMA,
  turkishdrama: TR_DRAMA,
  turkishdramas: TR_DRAMA,
  turkishseries: TR_DRAMA,
  dizi: TR_DRAMA,
  anime: { country: "JP", genre: TmdbGenre.ANIMATION, types: BOTH },
  donghua: { country: "CN", genre: TmdbGenre.ANIMATION, types: BOTH },
  bollywood: { country: "IN", types: [MediaType.MOVIE] },
};

/**
 * Searches naming a studio or a streaming service ("disney", "ghibli", "hbo") → its titles
 * (TMDB discover: movies by production company, shows by network when it has one, else by
 * company). A title search alone only finds titles with the name in them ("Disney's …"). IDs
 * checked against TMDB /company and /network. Keys: lower-case, letters / digits only.
 */
type StudioAlias = { companies?: number[]; networks?: number[]; types: MediaType[] };
const DISNEY: StudioAlias = { companies: [2, 6125], networks: [54, 2739], types: BOTH };
const MARVEL: StudioAlias = { companies: [420, 38679], types: BOTH };
const GHIBLI: StudioAlias = { companies: [10342], types: BOTH };
const KYOANI: StudioAlias = { companies: [5438], types: BOTH };
const WARNER: StudioAlias = { companies: [174], types: [MediaType.MOVIE] };
const APPLE: StudioAlias = { networks: [2552], types: [MediaType.TV] };
const PRIME: StudioAlias = { networks: [1024], types: [MediaType.TV] };
export const SEARCH_STUDIO_ALIASES: Record<string, StudioAlias> = {
  disney: DISNEY,
  waltdisney: DISNEY,
  disneyplus: { networks: [2739], types: [MediaType.TV] },
  pixar: { companies: [3], types: [MediaType.MOVIE] },
  marvel: MARVEL,
  marvelstudios: MARVEL,
  mcu: { companies: [420], types: BOTH },
  lucasfilm: { companies: [1], types: BOTH },
  dreamworks: { companies: [521], types: BOTH },
  ghibli: GHIBLI,
  studioghibli: GHIBLI,
  illumination: { companies: [6704], types: [MediaType.MOVIE] },
  warnerbros: WARNER,
  warnerbrothers: WARNER,
  a24: { companies: [41077], types: BOTH },
  blumhouse: { companies: [3172], types: BOTH },
  universal: { companies: [33], types: [MediaType.MOVIE] },
  paramount: { companies: [4], types: [MediaType.MOVIE] },
  sonyanimation: { companies: [2251], types: [MediaType.MOVIE] },
  amblin: { companies: [56], types: [MediaType.MOVIE] },
  lionsgate: { companies: [1632], types: [MediaType.MOVIE] },
  toei: { companies: [5542], types: BOTH },
  toeianimation: { companies: [5542], types: BOTH },
  mappa: { companies: [21444], types: BOTH },
  kyotoanimation: KYOANI,
  kyoani: KYOANI,
  ufotable: { companies: [5887, 280276], types: BOTH },
  madhouse: { companies: [3464], types: BOTH },
  witstudio: { companies: [31058], types: BOTH },
  hbo: { companies: [3268], networks: [49], types: BOTH },
  netflix: { companies: [178464], networks: [213], types: BOTH },
  appletv: APPLE,
  appletvplus: APPLE,
  primevideo: PRIME,
  amazonprime: PRIME,
  hulu: { networks: [453], types: [MediaType.TV] },
};
/** TMDB keywords kept per title (catalog + tracking docs) */
export const TITLE_KEYWORD_MAX = 40;
/** Networks kept per title (TV; TMDB lists the original one first) */
export const TITLE_NETWORK_MAX = 2;
/** Lead production companies kept per title — more pulled in every co-production committee and
 *  drowned the well-known names in the filter. Own cap, so a multi-network show keeps its studio */
export const TITLE_COMPANY_MAX = 3;

/** Per-user subcollections of the tracking delta sync (mirrors app UserCollection) */
export enum UserCollection {
  TRACKING = "tracking",
  /** One entry per deleted tracking doc (same id) — other devices drop their saved copy */
  TRACKING_DELETIONS = "trackingDeletions",
  /** One doc per media type (tv / movie): every genre + keyword across the user's tracked
   *  titles, with how many titles carry it — Watch History's filter choices */
  FACETS = "facets",
}

/** facets/{mediaType}{FACET_INDEX_SUFFIX} ("tvIndex"): title id → its genre / country / studio /
 *  keyword codes (FacetCode prefixes), so the filter drawer can hide choices no title shares with
 *  the ones picked. Mirrors app */
export const FACET_INDEX_SUFFIX = "Index";
/** Keywords per title in the index — all 40 would push a big library's doc past 1 MB. A subset
 *  can only hide a valid keyword choice, never offer a dead one */
export const FACET_INDEX_KEYWORDS = 8;
export enum FacetCode {
  GENRE = "g:",
  COUNTRY = "c:",
  STUDIO = "s:",
  KEYWORD = "k:",
}

/** Server time of a tracking doc's last write — clients' delta listener reads only docs past it */
export const TRACKING_UPDATED_AT = "updatedAt";
/** Deletion log entries expire after this (Firestore TTL on `expireAt`) */
export const TRACKING_DELETION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * TVMaze has no release time for most streaming episodes (empty airtime) and fills airstamp
 * with 12:00 UTC on the US date — a European viewer then saw a Disney+ evening drop as aired
 * the day before. Untimed episodes get their service's usual release time instead (wall clock
 * in that zone on TVMaze's airdate). Keys: the webChannel name, lower-case, letters/digits only.
 */
export const STREAMING_RELEASE_TIMES: Record<string, { time: string; timeZone: string }> = {
  disney: { time: "18:00", timeZone: "America/Los_Angeles" },
  netflix: { time: "00:00", timeZone: "America/Los_Angeles" },
  hulu: { time: "00:00", timeZone: "America/Los_Angeles" },
  max: { time: "00:00", timeZone: "America/Los_Angeles" },
  hbomax: { time: "00:00", timeZone: "America/Los_Angeles" },
  paramount: { time: "00:00", timeZone: "America/Los_Angeles" },
  peacock: { time: "00:00", timeZone: "America/Los_Angeles" },
  appletv: { time: "00:00", timeZone: "America/New_York" },
  primevideo: { time: "00:00", timeZone: "UTC" },
  amazonprimevideo: { time: "00:00", timeZone: "UTC" },
};

/** Untimed episode, no known streaming service: this time in the studio's timezone */
export const UNTIMED_STUDIO_TIME = "12:00";

/** Studio timezone from a show's origin country (TMDB origin_country) when TVMaze has none */
export const COUNTRY_TIMEZONES: Record<string, string> = {
  US: "America/Los_Angeles",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CO: "America/Bogota",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  PL: "Europe/Warsaw",
  TR: "Europe/Istanbul",
  IL: "Asia/Jerusalem",
  IN: "Asia/Kolkata",
  TH: "Asia/Bangkok",
  PH: "Asia/Manila",
  ID: "Asia/Jakarta",
  CN: "Asia/Shanghai",
  TW: "Asia/Taipei",
  HK: "Asia/Hong_Kong",
  KR: "Asia/Seoul",
  JP: "Asia/Tokyo",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg",
};

/** What trackingSyncStamp does for one tracking doc write */
export enum TrackingWriteAction {
  /** Written without a new updatedAt (old app build, a missed writer) → stamp it */
  STAMP = "stamp",
  /** Deleted → make sure the deletion log has it */
  LOG_DELETION = "log_deletion",
}

/** config/release: each release channel's latest APK + minimum build (CI's publish-release) */
export const RELEASE_CONFIG_PATH = "config/release";

/** App release channels (the app's ReleaseChannel) */
export enum ReleaseChannel {
  DEV = "dev",
  PROD = "prod",
}

/** HttpsError message a callable rejects an app build below its channel's minimum with */
export const UPDATE_REQUIRED_MESSAGE = "update-required";
/** The cached minimum builds are re-read this often per instance */
export const RELEASE_MINS_TTL_MS = 60_000;

/** FCM topic per release channel for new-version pushes (app enums UPDATE_TOPIC) */
export const UPDATE_TOPIC: Record<ReleaseChannel, string> = {
  [ReleaseChannel.DEV]: "app-updates-dev",
  [ReleaseChannel.PROD]: "app-updates-prod",
};
/** FCM data `type` of a new-version push (app enums APP_UPDATE_MESSAGE) */
export const APP_UPDATE_MESSAGE = "app_update";
/** Header carrying sendTestPush's key */
export const TEST_PUSH_KEY_HEADER = "x-test-push-key";
