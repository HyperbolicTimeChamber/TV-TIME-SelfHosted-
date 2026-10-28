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

/** Firebase auth errors meaning the session is truly dead (account deleted/disabled, token revoked) */
export enum FatalAuthError {
	USER_NOT_FOUND = "auth/user-not-found",
	USER_DISABLED = "auth/user-disabled",
	USER_TOKEN_EXPIRED = "auth/user-token-expired",
	INVALID_USER_TOKEN = "auth/invalid-user-token",
}

/** Only these may sign the user out automatically — never a network/timeout error */
export const FATAL_AUTH_ERRORS: string[] = Object.values(FatalAuthError);

/** Why a screen failed to load — drives the error state's copy and actions */
export enum LoadErrorKind {
	NOT_FOUND = "not_found",
	OFFLINE = "offline",
	SERVER = "server",
}

export enum MediaFilter {
	ALL = "all",
	TV = "tv",
	MOVIE = "movie",
}

export enum FreshTag {
	NEW = "NEW",
	JUST_AIRED = "RECENT RELEASE",
	FINALE = "FINALE",
	LATEST = "LATEST",
}

export const JUST_AIRED_WINDOW_DAYS = 7;

export enum CacheKey {
	WATCHLIST_PROFILE = "profile_watchlist_cache",
	WATCHLIST_ACTIVE = "watchlist_active_cache_v2",
	/** Confirmed: every tracking page is loaded (nothing more to page in) — skips the skeleton footer */
	WATCHLIST_EXHAUSTED = "watchlist_exhausted_v1",
	UPCOMING_EPISODES = "upcoming_episodes_cache_v2",
	UPCOMING_BUILT = "upcoming_subcollection_built",
	USER_STATS = "profile_stats_cache",
	HIDE_UNRELEASED_MODAL = "hideUnreleasedMovieModal",
	IMPORT_IN_PROGRESS = "import_in_progress",
	/** Legacy: the whole catalog as one ~2MB value — Android couldn't read it back. Deleted on start */
	CATALOG_CACHE = "catalog_cache_v1",
	/** Doc ids of the shows saved under CATALOG_SHOW */
	CATALOG_INDEX = "catalog_index_v2",
	/** + docId — one catalog show per value */
	CATALOG_SHOW = "catalog_show_v2:",
	CATALOG_SYNC_STAMP = "catalog_sync_stamp_v1",
	UPCOMING_PAST = "upcoming_past_v1",
	PROFILE_CARD_IMAGES = "profile_card_images_v1",
	WEEKLY_ACTIVITY = "weekly_activity_v1",
	WATCHING_COUNT = "watching_count_v1",
	COMPLETED_SECTIONS = "completed_sections_v1",
	// v2: v1 could hold months saved empty before tracked ids loaded
	CALENDAR_MONTHS = "calendar_months_v2",
	/** + `_${mediaType}` — Watch History pages per tab */
	WATCH_HISTORY = "watch_history_v1",
	/** Watch History sort choice (kept across visits) */
	HISTORY_SORT = "history_sort_v1",
}

export enum QueryKey {
	WATCHED_EPISODES = "watchedEpisodes",
	WATCHED_MOVIES = "watchedMovies",
	TRACKED_IDS = "trackedIds",
	SHOW = "show",
	SEASON = "season",
	SEASON_IMAGES = "seasonImages",
	SEARCH = "search",
	TRENDING = "trending",
	TITLE_LOGO = "titleLogo",
}

/** Fill of the shared 44px circular icon buttons (back, share) */
export enum CircleButtonTone {
	/** Translucent black — floating over artwork */
	OVERLAY = "overlay",
	SURFACE = "surface",
	SURFACE_LIGHT = "surfaceLight",
	/** Brightest grey (the border colour) — stands out on black */
	RAISED = "raised",
}

/** Watch History card status pill (label text) */
export enum HistoryPill {
	WATCHING = "Currently Watching",
	REWATCHING = "Rewatching",
	COMPLETED = "Completed",
	/** Stopped part-way (paused / paused rewatch) */
	PAUSED = "Incomplete",
}

/** Watch History sort order — each is a Firestore orderBy, so lists stay paginated */
export enum HistorySort {
	LAST_WATCHED = "lastWatched",
	TIME_SPENT = "timeSpent",
}

/** Search results sort — client-side over the pages already loaded */
export enum SearchSort {
	/** Release date (movie) / first air date (TV) */
	DATE = "date",
	/** Displayed title, dictionary order */
	NAME = "name",
}

export enum SortDirection {
	ASC = "asc",
	DESC = "desc",
}

/** Watch History status filters (TV) — OR together, applied in the Firestore query */
export enum HistoryFilter {
	PAUSED = "paused",
	WATCHING = "watching",
	REWATCHING = "rewatching",
}

/** Watch History card bottom-right module */
export enum HistoryProgress {
	PERCENT = "percent",
	UP_TO_DATE = "upToDate",
	PAUSED = "paused",
}

export enum DocChangeType {
	ADDED = "added",
	MODIFIED = "modified",
	REMOVED = "removed",
}

export enum CloudFunction {
	ADD_SHOW = "addShow",
	REMOVE_SHOW = "removeShow",
	MARK_SEASON_WATCHED = "markSeasonWatched",
	IMPORT_MATCHES = "importMatches",
	REBUILD_UPCOMING = "rebuildUpcoming",
	REFRESH_SHOW = "refreshShow",
	DELETE_ACCOUNT = "deleteAccount",
}

/** Callable error codes (web SDK prefixes them with "functions/") */
export enum CallableErrorCode {
	DEADLINE_EXCEEDED = "deadline-exceeded",
	UNAVAILABLE = "unavailable",
	ALREADY_EXISTS = "already-exists",
}

/**
 * The import Cloud Function may still be running → wait for its lastImportAt: the call gave
 * up (timeout / dropped connection) or another import for this user holds the lock
 */
export const IMPORT_MAYBE_RUNNING_ERRORS: string[] = [
	CallableErrorCode.DEADLINE_EXCEEDED,
	CallableErrorCode.UNAVAILABLE,
	CallableErrorCode.ALREADY_EXISTS,
];

/** importMatches timeout (3600s) + slack: no lastImportAt by then → the import failed */
export const IMPORT_MAX_WAIT_MS = 62 * 60 * 1000;

/** Phone clock vs server timestamp tolerance when matching lastImportAt to this import */
export const IMPORT_CLOCK_SKEW_MS = 2 * 60 * 1000;

/** TMDB episode_type — only FINALE earns the card's FINALE tag (mirrors functions/shared/enums) */
export enum EpisodeType {
	STANDARD = "standard",
	FINALE = "finale",
	MID_SEASON = "mid_season",
}

/** Why the client asks refreshShow for a shared TMDB refresh (mirrors functions/shared/enums) */
export enum RefreshReason {
	/** Last catalog episode has aired and isn't a finale → TMDB may list new episodes */
	AIRED_NO_FINALE = "aired_no_finale",
	/** Catalog lacks a poster / real next-episode title / movie credits */
	MISSING_DATA = "missing_data",
	/** This client's TMDB season response differs from the catalog */
	STALE_SEASON = "stale_season",
}

const HOUR_MS = 60 * 60 * 1000;

/** Server-side dedupe window per reason (functions REFRESH_COOLDOWN_MS) — a cached doc checked
 *  inside it needs no call */
export const REFRESH_COOLDOWN_MS: Record<RefreshReason, number> = {
	[RefreshReason.AIRED_NO_FINALE]: 6 * HOUR_MS,
	[RefreshReason.MISSING_DATA]: 6 * HOUR_MS,
	[RefreshReason.STALE_SEASON]: HOUR_MS / 2,
};

/** Last listed episode aired longer ago than this → the weekly sync has had its chance */
export const REFRESH_AIRED_WINDOW_DAYS = 14;

export enum Route {
	// Main tabs
	HOME = "Home",
	SEARCH = "Search",
	CALENDAR = "Calendar",
	PROFILE = "Profile",

	// Home top tabs
	WATCHLIST = "Watchlist",
	UPCOMING = "Upcoming",

	// Root stack
	SWIPE_TABS = "SwipeTabs",

	// Stack screens
	HOME_TABS = "HomeTabs",
	SHOW_DETAIL = "ShowDetail",
	SEASON_DETAIL = "SeasonDetail",
	SEARCH_MAIN = "SearchMain",
	SEARCH_INPUT = "SearchInput",
	SEARCH_RESULTS = "SearchResults",
	CALENDAR_MAIN = "CalendarMain",
	PROFILE_MAIN = "ProfileMain",
	SETTINGS = "Settings",
	WATCH_HISTORY = "WatchHistory",
	IMPORT_DATA = "ImportData",
}

// Base URLs come from app/.env (EXPO_PUBLIC_* is inlined at build time; CI writes the file)
/** Public web app — share links + App Links / Universal Links domain */
export const WEB_BASE_URL = process.env.EXPO_PUBLIC_WEB_BASE_URL ?? "";
/** TMDB REST API base */
export const TMDB_API_BASE = process.env.EXPO_PUBLIC_TMDB_API_BASE ?? "";
/** Web only: tmdbProxy CF path for logged-out visitors (unset on mobile) */
export const TMDB_PROXY_BASE = process.env.EXPO_PUBLIC_TMDB_PROXY_BASE ?? "";
/** Distribution channel this build was made for — CI writes it; unset locally (never force-updated) */
export const RELEASE_CHANNEL = process.env.EXPO_PUBLIC_RELEASE_CHANNEL ?? "";
/** Where testers on this channel get the latest build (App Distribution tester link) */
export const UPDATE_URL = process.env.EXPO_PUBLIC_UPDATE_URL ?? "";

export enum ReleaseChannel {
	DEV = "dev",
	PROD = "prod",
}

/** config/app field holding the minimum build number per channel (set by CI on [force-update]) */
export const MIN_BUILD_FIELD: Record<ReleaseChannel, string> = {
	[ReleaseChannel.DEV]: "minBuildDev",
	[ReleaseChannel.PROD]: "minBuildProd",
};

/** Stand-in "API key" meaning: no key — route TMDB calls through TMDB_PROXY_BASE */
export const TMDB_PROXY_KEY = "__tmdb_proxy__";
