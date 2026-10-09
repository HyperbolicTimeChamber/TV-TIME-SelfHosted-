import { MediaType, WEB_BASE_URL } from "../enums";

/** Shareable show link — the web show page, which deep-links into the app when installed */
export function showShareUrl(mediaType: MediaType, tmdbId: number): string {
	return `${WEB_BASE_URL}/show/${mediaType === MediaType.MOVIE ? "movie" : "tv"}/${tmdbId}`;
}
