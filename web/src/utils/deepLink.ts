import { MediaType } from "@app/enums";

/** Custom-scheme link into the installed app (iOS AltStore builds can't use Universal Links) */
export const appDeepLink = (mediaType: MediaType, tmdbId: number) =>
	`watchloom://show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;

export const isMobileBrowser = () =>
	typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
