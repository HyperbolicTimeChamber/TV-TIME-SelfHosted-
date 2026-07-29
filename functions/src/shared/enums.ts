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

export enum TmdbProxyAction {
	SEARCH = "search",
	SUGGESTIONS = "suggestions",
	TRENDING = "trending",
	SHOW_DETAILS = "showDetails",
	SEASON_DETAILS = "seasonDetails",
	DISCOVER_TV = "discoverTV",
	DISCOVER_MOVIES = "discoverMovies",
	FIND_BY_TVDB_ID = "findByTvdbId",
}
