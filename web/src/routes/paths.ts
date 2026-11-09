import { MediaType } from "@app/enums";

/** Web routes — mirror the app's screens; /show/... also matches share links */
/** Search page URL param: the All / TV / Movies filter, so coming back from a title keeps it */
export const SEARCH_TYPE_PARAM = "type";

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
	LISTS: "/profile/lists",
	LIST: "/profile/lists/:listId",
	SHOW: "/show/:mediaType/:tmdbId",
} as const;

export const listPath = (listId: string) => `/profile/lists/${listId}`;

export const showPath = (mediaType: MediaType, tmdbId: number) =>
	`/show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;
