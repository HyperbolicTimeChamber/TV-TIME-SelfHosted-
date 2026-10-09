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
	IMPORT: "/profile/import",
	SHOW: "/show/:mediaType/:tmdbId",
	SEASON: "/show/:mediaType/:tmdbId/season/:season",
} as const;

export const showPath = (mediaType: MediaType, tmdbId: number) =>
	`/show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;

export const seasonPath = (tmdbId: number, season: number) => `/show/tv/${tmdbId}/season/${season}`;
