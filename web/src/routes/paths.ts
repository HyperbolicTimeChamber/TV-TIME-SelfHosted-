import { MediaType } from "@app/enums";

/** Web routes — mirror the app's screens; /show/... also matches share links */
export const Paths = {
	ROOT: "/",
	LOGIN: "/login",
	HOME: "/home",
	UPCOMING: "/home/upcoming",
	CALENDAR: "/calendar",
	SEARCH: "/search",
	SEARCH_INPUT: "/search/input",
	PROFILE: "/profile",
	SETTINGS: "/profile/settings",
	WATCH_HISTORY: "/profile/history",
	IMPORT: "/profile/import",
	SHOW: "/show/:mediaType/:tmdbId",
} as const;

export const showPath = (mediaType: MediaType, tmdbId: number) =>
	`/show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;
