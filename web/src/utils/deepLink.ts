import { MediaType } from "@app/enums";

/** Custom-scheme link into the installed app */
export const appDeepLink = (mediaType: MediaType, tmdbId: number) =>
	`watchloom://show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;

/** The app ships on Android only — no iOS build to open */
export const isAndroidBrowser = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
