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
  IMPORT_DATA = "ImportData",
}
