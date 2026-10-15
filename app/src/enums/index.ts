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
	UPCOMING_EPISODES = "upcoming_episodes_cache_v2",
	UPCOMING_BUILT = "upcoming_subcollection_built",
	USER_STATS = "profile_stats_cache",
	HIDE_UNRELEASED_MODAL = "hideUnreleasedMovieModal",
	IMPORT_IN_PROGRESS = "import_in_progress",
	CATALOG_CACHE = "catalog_cache_v1",
	CATALOG_SYNC_STAMP = "catalog_sync_stamp_v1",
	UPCOMING_PAST = "upcoming_past_v1",
	PROFILE_CARD_IMAGES = "profile_card_images_v1",
	WEEKLY_ACTIVITY = "weekly_activity_v1",
	COMPLETED_SECTIONS = "completed_sections_v1",
	// v2: v1 could hold months saved empty before tracked ids loaded
	CALENDAR_MONTHS = "calendar_months_v2",
	/** + `_${mediaType}` — Watch History pages per tab */
	WATCH_HISTORY = "watch_history_v1",
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
}

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
