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
	/** In-app update: the build "Not now" was tapped on (its drawer stays away until a newer one) */
	UPDATE_SKIPPED_BUILD = "update_skipped_build",
	/** Debug (dev / staging builds): a simulated update / force update for the test flow (JSON) */
	UPDATE_SIMULATION = "update_simulation",
	/** The build the last launch ran (app_updated) */
	LAST_RUN_BUILD = "last_run_build",
	/** The build the update drawer last started downloading (app_updated source) */
	UPDATE_DRAWER_BUILD = "update_drawer_build",
	WATCHLIST_PROFILE = "profile_watchlist_cache",
	WATCHLIST_ACTIVE = "watchlist_active_cache_v2",
	/** Confirmed: every tracking page is loaded (nothing more to page in) — skips the skeleton footer */
	WATCHLIST_EXHAUSTED = "watchlist_exhausted_v1",
	/** Measured watchlist row heights by row type (WatchlistTab rowSizes) */
	WATCHLIST_ROW_SIZES = "watchlist_row_sizes_v2",
	UPCOMING_EPISODES = "upcoming_episodes_cache_v2",
	UPCOMING_BUILT = "upcoming_subcollection_built",
	USER_STATS = "profile_stats_cache",
	HIDE_UNRELEASED_MODAL = "hideUnreleasedMovieModal",
	IMPORT_IN_PROGRESS = "import_in_progress",
	/** Prefix; the uid is appended. Import screen done/skipped, kept on the device in case the Firestore write fails */
	IMPORT_DONE = "import_done_",
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
	/** + uid — this device saw users/{uid}.customListsSeeded (the server flag) set: skip checking it */
	CUSTOM_LISTS_SEEDED = "custom_lists_seeded_v1:",
	/** + uid — ids of the saved custom lists (each list under CUSTOM_LIST_CACHE; one value per list
	 *  so a big list can't push a single value past Android's ~1M-char read limit) */
	CUSTOM_LISTS_CACHE = "custom_lists_cache_v1:",
	/** + uid + "_" + listId — one saved custom list */
	CUSTOM_LIST_CACHE = "custom_list_cache_v1:",
	/** + uid + "_" + tracking doc id — a list title's last seen tracking state (list card tags);
	 *  "null" = not tracked. One small value per title. v2: a detail-page Pause used to store "null"
	 *  here (it fired the removal event), hiding paused titles as untracked */
	LIST_TRACKING = "list_tracking_v2:",
	/** A list page's Grid / List choice (kept across lists and visits) */
	CUSTOM_LIST_VIEW = "custom_list_view_v1",
	/** Hall of Shame: Grid / List */
	HISTORY_VIEW = "history_view_v1",
	/** The viewer's country + when it was looked up (Where to Watch) */
	USER_REGION = "user_region_v1",
	/** Search (Trending + results): Grid / List */
	SEARCH_VIEW = "search_view_v1",
	/** + uid — Previously Watched episodes: the first history page, reused all day */
	WATCHED_EPISODES_HISTORY = "watched_episodes_history_v1:",
	/** + uid — Previously Watched movies: the first history page, reused all day */
	WATCHED_MOVIES_HISTORY = "watched_movies_history_v1:",
	/** + uid — tracking delta sync state: lastSync, saved page count, hasMore, last full fetch day */
	TRACKING_SYNC = "tracking_sync_v1:",
	/** + uid + "_" + page index — one saved page of tracking docs (Firestore page order) */
	TRACKING_PAGE = "tracking_page_v1:",
	/** Last app_opened time (ms) — derives days_since_last_open */
	LAST_APP_OPEN = "last_app_open_v1",
	/** + uid — sign_up_completed already sent for this account */
	SIGN_UP_TRACKED = "sign_up_tracked_v1:",
	/** + uid → last Mixpanel profile props sent (skip unchanged re-sends) */
	MIXPANEL_PROFILE = "mixpanel_profile_v1:",
	/** `${tmdbId}_${season}` → ms TMDB was last asked for Upcoming's placeholder titles */
	UPCOMING_TITLE_CHECKS = "upcoming_title_checks_v1",
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
	CUSTOM_LISTS = "customLists",
	TITLE_INFO = "titleInfo",
	/** + tmdbId, mediaType, region — a title's info page extras (titleExtras CF) */
	TITLE_EXTRAS = "titleExtras",
	/** The viewer's country (IP lookup, else the device locale) */
	USER_REGION = "userRegion",
	/** TMDB's country list (code → English name) */
	COUNTRY_NAMES = "countryNames",
	/** + tmdbId, mediaType — a title's full cast, paged (View All sheet, titleCastPage CF) */
	TITLE_CAST_PAGE = "titleCastPage",
}

/** Info page pills, longest first — a pill shows the first that fits on one line */
export const MARK_WATCHED_LABELS = ["Mark as Watched", "Mark Watched", "Watched"] as const;
export const ADD_TO_WATCHLIST_LABELS = ["+ Add to Watchlist", "+ Watchlist", "+ Add"] as const;

/**
 * Where to Watch: where a service's button goes, by its short display name (lowercase). `search`
 * opens the service's search for the title (`{q}` = the title) where it takes one from a link;
 * otherwise `home` opens the service. Plain https links: on a phone the service's app opens them
 * when installed. Most apps open such a search link on an empty search page (the query is
 * dropped), so a phone opens `home` instead unless `appSearch` says the app fills the search in.
 * Not listed → TMDB's watch page for the title (it links on to each service).
 * TMDB doesn't expose services' own title ids, so a title page can't be linked directly.
 */
/**
 * `androidPackage`: the service's Android app — opened directly (the link in it, else its home
 * screen) instead of the browser first; listed in modules/service-apps' manifest <queries> too
 */
export const PROVIDER_LINKS: Record<
	string,
	{ search?: string; home: string; appSearch?: boolean; androidPackage?: string }
> = {
	netflix: {
		search: "https://www.netflix.com/search?q={q}",
		home: "https://www.netflix.com/",
		androidPackage: "com.netflix.mediaclient",
	},
	"prime video": {
		search: "https://www.primevideo.com/search/ref=atv_nb_sr?phrase={q}",
		home: "https://www.primevideo.com/",
		androidPackage: "com.amazon.avod.thirdpartyclient",
	},
	"disney+": { home: "https://www.disneyplus.com/", androidPackage: "com.disney.disneyplus" },
	"hbo max": {
		search: "https://play.hbomax.com/search?q={q}",
		home: "https://play.hbomax.com/",
		androidPackage: "com.wbd.stream",
	},
	"apple tv+": {
		search: "https://tv.apple.com/search?term={q}",
		home: "https://tv.apple.com/",
		androidPackage: "com.apple.atve.androidtv.appletv",
	},
	"apple tv": {
		search: "https://tv.apple.com/search?term={q}",
		home: "https://tv.apple.com/",
		androidPackage: "com.apple.atve.androidtv.appletv",
	},
	"paramount+": { home: "https://www.paramountplus.com/", androidPackage: "com.cbs.app" },
	hulu: {
		search: "https://www.hulu.com/search?q={q}",
		home: "https://www.hulu.com/",
		androidPackage: "com.hulu.plus",
	},
	peacock: { home: "https://www.peacocktv.com/", androidPackage: "com.peacocktv.peacockandroid" },
	"peacock premium": { home: "https://www.peacocktv.com/", androidPackage: "com.peacocktv.peacockandroid" },
	crunchyroll: {
		search: "https://www.crunchyroll.com/search?q={q}",
		home: "https://www.crunchyroll.com/",
		androidPackage: "com.crunchyroll.crunchyroid",
	},
	youtube: {
		search: "https://www.youtube.com/results?search_query={q}",
		home: "https://www.youtube.com/",
		appSearch: true,
		androidPackage: "com.google.android.youtube",
	},
	"youtube premium": {
		search: "https://www.youtube.com/results?search_query={q}",
		home: "https://www.youtube.com/",
		appSearch: true,
		androidPackage: "com.google.android.youtube",
	},
	mubi: {
		search: "https://mubi.com/search/films?query={q}",
		home: "https://mubi.com/",
		androidPackage: "com.mubi",
	},
	"rtl+": { search: "https://plus.rtl.de/suche?q={q}", home: "https://plus.rtl.de/" },
	"rtl+ max": { search: "https://plus.rtl.de/suche?q={q}", home: "https://plus.rtl.de/" },
	joyn: {
		search: "https://www.joyn.de/suche?q={q}",
		home: "https://www.joyn.de/",
		androidPackage: "de.prosiebensat1digital.seventv",
	},
	"joyn plus": {
		search: "https://www.joyn.de/suche?q={q}",
		home: "https://www.joyn.de/",
		androidPackage: "de.prosiebensat1digital.seventv",
	},
	wow: { home: "https://www.wowtv.de/" },
	"wow fiction": { home: "https://www.wowtv.de/" },
	"sky go": { home: "https://www.sky.de/sky-go" },
	"pluto tv": { home: "https://pluto.tv/", androidPackage: "tv.pluto.android" },
	plex: { home: "https://watch.plex.tv/", androidPackage: "com.plexapp.android" },
	"animation digital network": { home: "https://animationdigitalnetwork.com/" },
};

/** Where to Watch: taps within this long of opening a service are ignored (no double open) */
export const PROVIDER_OPEN_GUARD_MS = 1000;

/** Update drawer, before the download: one of these (Upgrade's voice) beside the download size */
export const UPGRADE_LINES = [
	"Time to merge with some new tech",
	"Your phone's due for an alien tune-up",
	"The latest tech is waiting for me",
	"Every gadget deserves an upgrade",
	"New code, same Upgrade",
	"Let me give this app a little boost",
] as const;

/** Where the viewer's country comes from: an IP lookup (no key, no permission prompt) */
export const COUNTRY_LOOKUP_URL = "https://api.country.is/";
/** The IP lookup is given this long before the device locale's region stands in */
export const COUNTRY_LOOKUP_TIMEOUT_MS = 3000;
/** The looked-up country is reused this long (a trip abroad updates it next day) */
export const USER_REGION_TTL_MS = 24 * 60 * 60 * 1000;
/** A title's extras change rarely: a CF answer is reused this long in a session */
export const TITLE_EXTRAS_STALE_MS = 24 * 60 * 60 * 1000;
/** Cast cards on the info page before View All (functions FEATURED_CAST_MAX) */
export const FEATURED_CAST_MAX = 10;
/** The cast sheet's search waits this long after the last keystroke */
export const CAST_SEARCH_DEBOUNCE_MS = 250;

/** Watch count sheet actions (episode / season / movie) */
export enum WatchAction {
	REWATCH = "rewatch",
	NOT_WATCHED = "not_watched",
	WATCHED_ONCE_LESS = "watched_once_less",
	/** Info page only: back to a single watch */
	WATCHED_ONCE = "watched_once",
}

/** How much of a title the user has watched — search's Remove is refused past NONE */
export enum WatchProgress {
	NONE = "none",
	/** Show mid first watch */
	STARTED = "started",
	/** Movie watched, or show completed / in a rewatch */
	WATCHED = "watched",
}

/** Custom lists live in users/{uid}/customLists — a list is only a bookmark, never tracking */
export const CUSTOM_LISTS_COLLECTION = "customLists";
/** Name length / count caps (mirrored in firestore.rules) */
export const CUSTOM_LIST_NAME_MAX = 50;
export const CUSTOM_LIST_ITEM_MAX = 500;
/** Add to List sheet: Find list + Sort show once this many lists don't hold the title yet */
export const ADD_TO_LIST_SEARCH_MIN_LISTS = 3;
export const CUSTOM_LIST_MAX = 50;
/** Custom lists the profile shows under Lists (the biggest), after the Recently Watched row */
export const PROFILE_LIST_COUNT = 5;
/** Posters in the profile's Recently Watched row */
export const RECENTLY_WATCHED_COUNT = 15;
/** The list every user starts with — a normal list, renamable and deletable */
export const FAVORITES_LIST_NAME = "Favorites";
/** Its fixed doc id: two devices seeding at once write the same doc, never two Favorites */
export const FAVORITES_LIST_ID = "favorites";
/** users/{uid} field: the default Favorites was offered (kept server-side, so deleting it on one
 *  device doesn't bring it back on another) */
export const CUSTOM_LISTS_SEEDED_FIELD = "customListsSeeded";
/** New List popup (Light Yagami art): the title, and the lines under it — one picked each open */
export const NEW_LIST_TITLE = "A New List for a New World";
export const NEW_LIST_HINTS = [
	"Let's list down some new ways to kill time.",
	"I'll take a potato chip… and list it!",
	"Every title goes in exactly as planned.",
	"Shinigami love apples. You'll love this list.",
] as const;
/** Sorts ahead of every other list (order falls back to createdAt, a huge number) */
export const FAVORITES_LIST_ORDER = -1;

/** How a list page lays out its titles */
export enum CustomListView {
	GRID = "grid",
	LIST = "list",
}

/** Exported lists: a JSON file the Import button reads back (also meant for sharing) */
export const LISTS_EXPORT_FORMAT = "watchloom-lists";
export const LISTS_EXPORT_VERSION = 1;

/** Whole-account export (Settings → Export My Data): tracking, watch history and lists.
 *  v2: an export can be narrowed (scope, filter) and carry only some parts (functions mirror) */
export const ACCOUNT_EXPORT_FORMAT = "watchloom-account";
export const ACCOUNT_EXPORT_VERSION = 2;
/** An account export file is ~1 MB per 10k watched episodes; this only stops a wrong file */
export const ACCOUNT_IMPORT_MAX_BYTES = 30 * 1024 * 1024;

/** Account export: which titles (functions ExportScope) */
export enum ExportScope {
	ALL = "all",
	MOVIES = "movies",
	TV = "tv",
	/** Custom lists only — no titles, progress or history (no second step) */
	LISTS = "lists",
}

/** Narrows an ExportScope (functions ExportFilter) */
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

/** What an export carries per title beyond its id / type / name (functions ExportPart) */
export enum ExportPart {
	/** Status, next episode, rewatch count, dates */
	PROGRESS = "progress",
	/** Every watched episode / movie with its count and dates */
	HISTORY = "history",
	/** Custom lists */
	LISTS = "lists",
}

/** The export sheet's second step: how much of each title goes in */
export enum ExportContent {
	EVERYTHING = "everything",
	/** The ExportParts ticked */
	CHOSEN = "chosen",
	/** Titles only (id, type, name) */
	TITLES = "titles",
}

/** Fill of the shared 44px circular icon buttons (back, share) */
export enum CircleButtonTone {
	/** Translucent black — floating over artwork */
	OVERLAY = "overlay",
	SURFACE = "surface",
	SURFACE_LIGHT = "surfaceLight",
	/** Brightest grey (the border colour) — stands out on black */
	RAISED = "raised",
	/** Amber — a toggled-on state (the Add to List button once the title is listed) */
	ACCENT = "accent",
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
	/** TMDB's own order (best match first) */
	RELEVANCE = "relevance",
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
/** Watch History: values pickable at once per facet (genres / keywords / countries / studios — the
 *  query's array-contains-any facet takes them all, and Firestore caps that list) */
export const HISTORY_FACET_MAX = 10;
/** Keyword chips the filter sheet lists before anything is typed (most common first) */
export const HISTORY_KEYWORD_SUGGESTIONS = 12;
/** A filtered view tops a short page up with at most this many more Firestore pages */
export const HISTORY_VIEW_REFILL_PAGES = 4;

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

/** One tag on a list card's tag line (the Watch History card's tags, plus Not Started) */
export enum ListTagKind {
	/** Currently Watching / Rewatching / Completed — optional rewatch count */
	STATUS = "status",
	PERCENT = "percent",
	UP_TO_DATE = "upToDate",
	PAUSED = "paused",
	WATCH_COUNT = "watchCount",
	/** On the watchlist, no episode watched yet (shows) — red */
	NOT_STARTED = "notStarted",
	/** On the watchlist, never watched (movies) */
	NOT_WATCHED = "notWatched",
	/** Ongoing / Ended (grid cards: a pill under the others, so the title gets the full width) */
	AIR_STATE = "airState",
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
	SEARCH_TITLES = "searchTitles",
	EXPORT_ACCOUNT_DATA = "exportAccountData",
	CANCEL_ACCOUNT_JOB = "cancelAccountJob",
	TITLE_EXTRAS = "titleExtras",
	TITLE_CAST_PAGE = "titleCastPage",
}

/** Callable error codes (web SDK prefixes them with "functions/") */
export enum CallableErrorCode {
	DEADLINE_EXCEEDED = "deadline-exceeded",
	UNAVAILABLE = "unavailable",
	ALREADY_EXISTS = "already-exists",
	CANCELLED = "cancelled",
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

/** Upcoming placeholder titles ("Episode 3"): re-ask TMDB for one season at most this often.
 *  The check was per session only — ~20 season fetches every launch for names TMDB doesn't
 *  have yet */
export const UPCOMING_TITLE_RECHECK_MS = 12 * HOUR_MS;

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
	LIST_DETAIL = "ListDetail",
	LISTS = "Lists",
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

/** config/release: each channel's latest APK + minimum build (CI writes it; public read — no
 *  secrets, and the login screen checks for updates too) */
export const RELEASE_CONFIG_DOC = ["config", "release"] as const;

/** Android package id (app.json) — the web's "Open in app" intent targets it */
export const ANDROID_APP_PACKAGE = "com.tvtimerevived.app";
/** GitHub's newest production release (public repo, no key): the web downloads its APK */
export const LATEST_RELEASE_API =
	"https://api.github.com/repos/HyperbolicTimeChamber/TV-TIME-SelfHosted-/releases/latest";
/** Its page — the fallback while the APK's address isn't known yet */
export const LATEST_RELEASE_PAGE =
	"https://github.com/HyperbolicTimeChamber/TV-TIME-SelfHosted-/releases/latest";

/** The channel this build checks for updates: CI's, or dev in a local dev build (test flow) */
export const UPDATE_CHANNEL: ReleaseChannel | null =
	(Object.values(ReleaseChannel) as string[]).includes(RELEASE_CHANNEL)
		? (RELEASE_CHANNEL as ReleaseChannel)
		: // Web has no __DEV__ (and no updates)
			(globalThis as { __DEV__?: boolean }).__DEV__
			? ReleaseChannel.DEV
			: null;

/** FCM topic a channel's new-version pushes go to (CI sends `{ type: APP_UPDATE_MESSAGE }`) */
export const UPDATE_TOPIC: Record<ReleaseChannel, string> = {
	[ReleaseChannel.DEV]: "app-updates-dev",
	[ReleaseChannel.PROD]: "app-updates-prod",
};
/** Message of the callables' refusal of a build below the minimum (functions UPDATE_REQUIRED_MESSAGE) */
export const UPDATE_REQUIRED_MESSAGE = "update-required";
/** FCM data `type` of a new-version push */
export const APP_UPDATE_MESSAGE = "app_update";


/** The APK a download is saved as (cache dir; replaced by each download) */
export const UPDATE_APK_FILE = "watchloom-update.apk";
/** Progress events are coalesced to this often (the notification can't redraw faster) */
export const UPDATE_PROGRESS_INTERVAL_MS = 500;
/** The release doc is re-read at most this often when the app comes back to the foreground */
export const UPDATE_RECHECK_MS = 60 * 60 * 1000;

/** A watchlist card heals (Firestore re-read / refreshShow) only after staying on screen this
 *  long — cards scrolled past aren't worth a read or a call */
export const HEAL_VIEW_DWELL_MS = 600;

/** Android: threads RNFirebase runs callables on — must equal firebase.json
 *  react-native.android_task_executor_maximum_pool_size (a test checks) */
export const NATIVE_CALLABLE_THREADS = 10;
/** Of those, kept for calls the user is waiting on (search, add, marks…): background calls
 *  (refreshShow / heal addShow) can never take them */
export const FOREGROUND_RESERVED_THREADS = 7;

/** Stand-in "API key" meaning: no key — route TMDB calls through TMDB_PROXY_BASE */
export const TMDB_PROXY_KEY = "__tmdb_proxy__";

/** Mixpanel project token (app/.env; CI writes it). Unset → no tracking, so a fork never reports here */
export const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN ?? "";
/** Mixpanel ingestion host — EU projects need https://api-eu.mixpanel.com. Unset → SDK default (US) */
export const MIXPANEL_SERVER_URL = process.env.EXPO_PUBLIC_MIXPANEL_SERVER_URL || undefined;

/** Mixpanel event names */
export enum AnalyticsEvent {
	APP_OPENED = "app_opened",
	EPISODE_MARKED_TRACKED = "episode_marked_tracked",
	/** An episode unwatched or its watch count lowered (debugs tracking-pointer bugs) */
	EPISODE_UNWATCHED = "episode_unwatched",
	EPISODE_TRACKING_SESSION_COMPLETED = "episode_tracking_session_completed",
	API_CALLED = "api_called",
	/** Aggregated Firestore reads / writes / deletes since the last flush */
	FIRESTORE_OPS = "firestore_ops",
	PAGE_VIEWED = "page_viewed",
	SIGN_UP_COMPLETED = "sign_up_completed",
	UPDATE_DRAWER_SHOWN = "update_drawer_shown",
	UPDATE_DRAWER_ACTION = "update_drawer_action",
	UPDATE_DOWNLOAD_FINISHED = "update_download_finished",
	/** First launch on a newer build */
	APP_UPDATED = "app_updated",
}

/** update_drawer_action `action` */
export enum UpdateDrawerAction {
	UPGRADE_NOW = "upgrade_now",
	RETRY = "retry",
	LATER = "later",
	CANCEL_DOWNLOAD = "cancel_download",
	INSTALL = "install",
	CLOSE_APP = "close_app",
}

/** update_download_finished `result` */
export enum UpdateDownloadResult {
	DONE = "done",
	FAILED = "failed",
	CANCELLED = "cancelled",
}

/** app_updated `source` */
export enum UpdateSource {
	DRAWER = "drawer",
	NOTIFICATION_OR_OTHER = "notification_or_other",
}

/** Mixpanel `client_platform` super property (backend adds cloud_function / script) */
export enum ClientPlatform {
	APP = "app",
	WEB = "web",
}

/** firestore_ops is sent at most this often (plus on background / tab hide) */
export const FIRESTORE_OPS_FLUSH_MS = 60 * 1000;
/** An account created this recently counts as a fresh sign-up on its first auth resolve */
export const SIGN_UP_WINDOW_MS = 10 * 60 * 1000;

/** app_opened `source` */
export enum AppOpenSource {
	ORGANIC = "organic",
	PUSH = "push",
	DEEP_LINK = "deep_link",
}

/** Marks this far apart start a new episode_tracking_session */
export const TRACKING_SESSION_IDLE_MS = 5 * 60 * 1000;

/** Local Firebase Emulator Suite ports (firebase.json → emulators) — dev only */
export enum EmulatorPort {
	AUTH = 9099,
	FIRESTORE = 8080,
	FUNCTIONS = 5001,
}

/** Per-user subcollections the tracking delta sync reads (users/{uid}/…) */
export enum UserCollection {
	TRACKING = "tracking",
	/** One entry per deleted tracking doc (same id) — other devices drop their saved copy */
	TRACKING_DELETIONS = "trackingDeletions",
	/** tv / movie: every genre + keyword across the tracked titles, counted (CF-written) —
	 *  Watch History's filter choices */
	FACETS = "facets",
}

/** Server time of a tracking doc's last write — the delta listener reads only docs past it */
export const TRACKING_UPDATED_AT = "updatedAt";
/** Deletion log entries expire (Firestore TTL on `expireAt`) after this; a device last synced
 *  longer ago than the daily full fetch can't miss one */
export const TRACKING_DELETION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Delta listener starts this far before the last seen write (commit order vs timestamp order) */
export const TRACKING_SYNC_OVERLAP_MS = 60 * 1000;

/**
 * Words typed into Hall of Shame's filter search that don't spell a chip's label → the chips they
 * mean, revealed in their sections ("k drama" shows South Korea under COUNTRY and Drama under
 * GENRE). Keys: lower-case, letters / digits only. Genre names cover both TMDB lists (TV "Sci-Fi &
 * Fantasy", movie "Science Fiction"): only the ones the user's titles carry show. An alias with a
 * country (a regional genre) also offers one chip that turns its country + genre on together.
 * The regional part mirrors functions SEARCH_REGION_ALIASES — keep both in step.
 */
export interface FilterAlias {
	label: string;
	countries?: string[];
	genres?: string[];
	keywords?: string[];
}
const regional = (label: string, country: string, genre?: string): FilterAlias => ({
	label,
	countries: [country],
	...(genre ? { genres: [genre] } : {}),
});
const K_DRAMA = regional("K-Drama", "KR", "Drama");
const J_DRAMA = regional("J-Drama", "JP", "Drama");
const C_DRAMA = regional("C-Drama", "CN", "Drama");
const TW_DRAMA = regional("Taiwanese Drama", "TW", "Drama");
const THAI_DRAMA = regional("Thai Drama", "TH", "Drama");
const TURKISH_DRAMA = regional("Turkish Drama", "TR", "Drama");
const ANIME = regional("Anime", "JP", "Animation");
const DONGHUA = regional("Donghua", "CN", "Animation");
const TELENOVELA = regional("Telenovela", "MX", "Drama");
const BRITCOM = regional("Britcom", "GB", "Comedy");
const NORDIC_NOIR: FilterAlias = {
	label: "Nordic Noir",
	countries: ["SE", "DK", "NO", "IS", "FI"],
	genres: ["Crime"],
};
/** Country by what people call its people / language ("korean" → KR) */
const DEMONYMS: Record<string, string[]> = {
	KR: ["korean", "korea", "kr"],
	JP: ["japanese", "jp"],
	CN: ["chinese", "mandarin", "cn"],
	TW: ["taiwanese"],
	HK: ["hongkong", "cantonese", "hk"],
	TH: ["thai"],
	PH: ["filipino", "philippine", "pinoy"],
	ID: ["indonesian"],
	IN: ["indian", "hindi", "desi"],
	TR: ["turkish", "turkey"],
	GB: ["british", "uk", "english", "england", "brit", "brits"],
	US: ["american", "usa", "us", "america"],
	CA: ["canadian"],
	AU: ["australian", "aussie"],
	NZ: ["kiwi"],
	IE: ["irish"],
	FR: ["french"],
	DE: ["german"],
	ES: ["spanish", "spain"],
	IT: ["italian"],
	PT: ["portuguese"],
	NL: ["dutch"],
	BE: ["belgian"],
	SE: ["swedish"],
	NO: ["norwegian"],
	DK: ["danish"],
	FI: ["finnish"],
	IS: ["icelandic"],
	PL: ["polish"],
	RU: ["russian"],
	UA: ["ukrainian"],
	MX: ["mexican"],
	BR: ["brazilian"],
	AR: ["argentine", "argentinian"],
	CO: ["colombian"],
	IL: ["israeli"],
	EG: ["egyptian"],
	ZA: ["southafrican"],
	NG: ["nigerian", "nollywood"],
};
/** Genre synonyms → TMDB genre names (TV and movie lists) */
const GENRE_WORDS: Array<[string[], string[]]> = [
	[
		["scifi", "sf", "sciencefiction", "space"],
		["Sci-Fi & Fantasy", "Science Fiction"],
	],
	[
		["fantasy", "magic"],
		["Sci-Fi & Fantasy", "Fantasy"],
	],
	[
		["action", "actionadventure"],
		["Action & Adventure", "Action"],
	],
	[["adventure"], ["Action & Adventure", "Adventure"]],
	[
		["war", "military", "politics", "political"],
		["War & Politics", "War"],
	],
	[["cartoon", "cartoons", "animated", "animation"], ["Animation"]],
	[
		["docs", "doc", "docu", "docuseries", "documentaries", "documentary", "truecrime"],
		["Documentary"],
	],
	[["sitcom", "sitcoms", "comedies", "funny"], ["Comedy"]],
	[
		["kids", "children", "childrens", "family"],
		["Kids", "Family"],
	],
	[["reality", "realitytv", "gameshow"], ["Reality"]],
	[
		["thriller", "thrillers", "suspense"],
		["Thriller", "Mystery", "Crime"],
	],
	[
		["detective", "whodunit", "mysteries"],
		["Mystery", "Crime"],
	],
	[["romance", "romantic", "love"], ["Romance"]],
	[["scary", "horror", "slasher"], ["Horror"]],
	[
		["history", "historical", "period"],
		["History", "War & Politics"],
	],
	[["musical", "musicals", "music"], ["Music"]],
	[["soap", "soaps", "soapopera"], ["Soap"]],
	[["talkshow", "latenight"], ["Talk"]],
	[["western", "westerns", "cowboy"], ["Western"]],
	[["telefilm", "tvmovie"], ["TV Movie"]],
];
/** Common words for TMDB keywords whose own names read differently */
const KEYWORD_WORDS: Array<[string[], string[]]> = [
	[["romcom", "romcoms"], ["romantic comedy"]],
	[
		["superhero", "superheroes", "capes"],
		["superhero", "based on comic"],
	],
	[
		["timetravel", "timeloop"],
		["time travel", "time loop"],
	],
	[["zombie", "zombies", "undead"], ["zombie"]],
	[["vampire", "vampires"], ["vampire"]],
	[
		["isekai", "anotherworld"],
		["isekai", "isekai (another world)"],
	],
	[
		["shonen", "shounen"],
		["shounen", "shonen"],
	],
	[
		["shojo", "shoujo"],
		["shoujo", "shojo"],
	],
	[["seinen"], ["seinen"]],
	[
		["mecha", "robots"],
		["mecha", "robot"],
	],
	[
		["dystopia", "dystopian", "postapocalyptic"],
		["dystopia", "post-apocalyptic future"],
	],
	[["miniseries", "limitedseries"], ["miniseries"]],
	[["basedonbook", "bookadaptation", "novel"], ["based on novel or book"]],
	[["basedonmanga", "manga"], ["based on manga"]],
	[["basedontruestory", "truestory"], ["based on true story"]],
	[["coming of age", "comingofage"], ["coming of age"]],
	[["highschool", "school"], ["high school"]],
	[["serialkiller"], ["serial killer"]],
	[["heist", "heists"], ["heist"]],
	[["lgbt", "lgbtq", "queer", "gay"], ["lgbt"]],
];
const buildFilterAliases = (): Record<string, FilterAlias> => {
	const out: Record<string, FilterAlias> = {};
	const squashKey = (k: string) => k.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
	const add = (key: string, alias: FilterAlias) => {
		const k = squashKey(key);
		const had = out[k];
		// Two tables naming one word ("romance": genre + keyword) → both shown
		out[k] = had
			? {
					label: had.label,
					countries: [...new Set([...(had.countries ?? []), ...(alias.countries ?? [])])],
					genres: [...new Set([...(had.genres ?? []), ...(alias.genres ?? [])])],
					keywords: [...new Set([...(had.keywords ?? []), ...(alias.keywords ?? [])])],
				}
			: alias;
	};
	for (const [code, words] of Object.entries(DEMONYMS))
		for (const w of words) add(w, { label: w, countries: [code] });
	for (const [words, genres] of GENRE_WORDS) for (const w of words) add(w, { label: w, genres });
	for (const [words, keywords] of KEYWORD_WORDS)
		for (const w of words) add(w, { label: w, keywords });
	// Regional genres last: their label / apply chip win over a demonym of the same word
	const regions: Array<[string[], FilterAlias]> = [
		[["kdrama", "kdramas", "koreandrama", "koreandramas", "koreanseries", "koreanshow"], K_DRAMA],
		[["jdrama", "jdramas", "japanesedrama", "japanesedramas"], J_DRAMA],
		[["cdrama", "cdramas", "chinesedrama", "chinesedramas"], C_DRAMA],
		[["twdrama", "twdramas", "taiwanesedrama", "taiwanesedramas"], TW_DRAMA],
		[["thaidrama", "thaidramas", "lakorn", "thaibl"], THAI_DRAMA],
		[["turkishdrama", "turkishdramas", "turkishseries", "dizi"], TURKISH_DRAMA],
		[["anime", "japaneseanimation"], ANIME],
		[["donghua", "chineseanimation", "chineseanime"], DONGHUA],
		[["bollywood"], regional("Bollywood", "IN")],
		[["telenovela", "telenovelas", "novela"], TELENOVELA],
		[["britcom", "britishcomedy"], BRITCOM],
		[["nordicnoir", "scandinoir", "scandi"], NORDIC_NOIR],
		[["kmovie", "koreanmovie", "koreanfilm"], regional("Korean Film", "KR")],
		[["jmovie", "japanesemovie", "japanesefilm"], regional("Japanese Film", "JP")],
	];
	for (const [words, alias] of regions)
		for (const w of words) {
			const k = squashKey(w);
			out[k] = { ...alias, keywords: out[k]?.keywords };
		}
	return out;
};
export const FILTER_ALIASES: Record<string, FilterAlias> = buildFilterAliases();

/** facets/{mediaType}{FACET_INDEX_SUFFIX} ("tvIndex"): title id → its facet codes — the filter
 *  drawer hides choices no title shares with the ones picked. Mirrors functions */
export const FACET_INDEX_SUFFIX = "Index";
/** Keywords per title the index keeps (functions FACET_INDEX_KEYWORDS) */
export const FACET_INDEX_KEYWORDS = 8;
export enum FacetCode {
	GENRE = "g:",
	COUNTRY = "c:",
	STUDIO = "s:",
	KEYWORD = "k:",
}

/** Country chip names (TMDB origin_country codes); a code not listed shows as the code */
export const COUNTRY_NAMES: Record<string, string> = {
	US: "United States",
	GB: "United Kingdom",
	CA: "Canada",
	AU: "Australia",
	NZ: "New Zealand",
	IE: "Ireland",
	KR: "South Korea",
	JP: "Japan",
	CN: "China",
	TW: "Taiwan",
	HK: "Hong Kong",
	TH: "Thailand",
	PH: "Philippines",
	ID: "Indonesia",
	MY: "Malaysia",
	SG: "Singapore",
	VN: "Vietnam",
	IN: "India",
	PK: "Pakistan",
	TR: "Turkey",
	IL: "Israel",
	EG: "Egypt",
	ZA: "South Africa",
	NG: "Nigeria",
	FR: "France",
	DE: "Germany",
	ES: "Spain",
	IT: "Italy",
	PT: "Portugal",
	NL: "Netherlands",
	BE: "Belgium",
	CH: "Switzerland",
	AT: "Austria",
	SE: "Sweden",
	NO: "Norway",
	DK: "Denmark",
	FI: "Finland",
	IS: "Iceland",
	PL: "Poland",
	CZ: "Czechia",
	HU: "Hungary",
	RO: "Romania",
	GR: "Greece",
	RU: "Russia",
	UA: "Ukraine",
	MX: "Mexico",
	BR: "Brazil",
	AR: "Argentina",
	CO: "Colombia",
	CL: "Chile",
	PE: "Peru",
	VE: "Venezuela",
};

/** Corner radius of list cards — watchlist rows match the calendar cards */
export const CARD_RADIUS = 16;
