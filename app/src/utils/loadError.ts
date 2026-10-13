import { LoadErrorKind, MediaType } from "../enums";

export interface LoadErrorInfo {
	kind: LoadErrorKind;
	title: string;
	message: string;
	/** Retrying can help (network / server hiccup) — a missing title won't come back */
	canRetry: boolean;
	/** Short code for support, e.g. "404" or "NETWORK" */
	code: string | null;
}

/**
 * Turn a failed load (axios / Firebase / missing data) into user-facing copy.
 * Shared by the app and web error screens.
 */
export function describeLoadError(error: unknown, mediaType: MediaType): LoadErrorInfo {
	const noun = mediaType === MediaType.MOVIE ? "movie" : "show";
	const e = error as { response?: { status?: number }; code?: string; message?: string } | null;
	const status = e?.response?.status;

	// No error but no data, or TMDB says it doesn't exist
	if (!e || status === 404) {
		return {
			kind: LoadErrorKind.NOT_FOUND,
			title: "You might be lost",
			message: `It may have been removed from TMDB, or the link is broken. Try searching for it instead.`,
			canRetry: false,
			code: status ? String(status) : null,
		};
	}

	const offline =
		!e.response &&
		(e.code === "ERR_NETWORK" ||
			e.code === "ECONNABORTED" ||
			e.code === "unavailable" ||
			/network|timeout|offline/i.test(e.message ?? ""));
	if (offline) {
		return {
			kind: LoadErrorKind.OFFLINE,
			title: "You're offline",
			message: `We couldn't reach the server to load this ${noun}. Check your connection and try again.`,
			canRetry: true,
			code: "NETWORK",
		};
	}

	return {
		kind: LoadErrorKind.SERVER,
		title: "Something went wrong",
		message: `We couldn't load this ${noun} right now. Please try again in a moment.`,
		canRetry: true,
		code: status ? String(status) : (e.code ?? null),
	};
}
