import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaType } from "../enums";
import type { TitleCastPage, TitleExtras } from "../types";
import { trackApi } from "./analytics";
import { foregroundCall } from "./callQueue";

/**
 * A title's info page extras (featured cast, directors, studios, the country's Where to Watch)
 * from the titleExtras CF: Firestore first; whatever's missing comes from TMDB in one request and
 * is stored. Works signed in or not
 */
export function fetchTitleExtras(
	tmdbId: number,
	mediaType: MediaType,
	region: string,
): Promise<TitleExtras> {
	return foregroundCall(() =>
		trackApi("cloud_function", CloudFunction.TITLE_EXTRAS, async () => {
			const res = await httpsCallable(getFunctions(), CloudFunction.TITLE_EXTRAS)({
				tmdbId,
				mediaType,
				region,
			});
			return res.data as TitleExtras;
		}),
	);
}

/** One page of a title's full cast (the View All sheet) from the titleCastPage CF — only the
 *  matches when there's a search (name or character) */
export function fetchCastPage(
	tmdbId: number,
	mediaType: MediaType,
	page: number,
	query: string,
): Promise<TitleCastPage> {
	return foregroundCall(() =>
		trackApi("cloud_function", CloudFunction.TITLE_CAST_PAGE, async () => {
			const res = await httpsCallable(getFunctions(), CloudFunction.TITLE_CAST_PAGE)({
				tmdbId,
				mediaType,
				page,
				...(query ? { query } : {}),
			});
			return res.data as TitleCastPage;
		}),
	);
}
