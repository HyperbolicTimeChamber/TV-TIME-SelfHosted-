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

export enum FreshTag {
  NEW = "NEW",
  JUST_AIRED = "JUST AIRED",
}

export const JUST_AIRED_WINDOW_DAYS = 7;

export enum CacheKey {
  WATCHLIST_PROFILE = "profile_watchlist_cache",
  WATCHLIST_ACTIVE = "watchlist_active_cache",
  UPCOMING_EPISODES = "upcoming_episodes_cache",
  UPCOMING_BUILT = "upcoming_subcollection_built",
  USER_STATS = "profile_stats_cache",
  HIDE_UNRELEASED_MODAL = "hideUnreleasedMovieModal",
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

  // Stack screens
  HOME_TABS = "HomeTabs",
  SHOW_DETAIL = "ShowDetail",
  SEASON_DETAIL = "SeasonDetail",
  SEARCH_MAIN = "SearchMain",
  CALENDAR_MAIN = "CalendarMain",
  PROFILE_MAIN = "ProfileMain",
  SETTINGS = "Settings",
  IMPORT_DATA = "ImportData",
}
