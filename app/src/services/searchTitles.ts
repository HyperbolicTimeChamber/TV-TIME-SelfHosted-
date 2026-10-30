import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaFilter } from "../enums";
import type { SearchBatch } from "../utils/searchBatch";
import { trackApi } from "./analytics";

/** CF idle timeout — a warmup inside it would only spend the caller's rate limit */
const WARM_FOR_MS = 15 * 60 * 1000;
let lastWarmup = 0;

/**
 * Start the searchTitles instance while the user is still typing, so the first search doesn't
 * also wait for a cold start
 */
export function warmupSearchTitles() {
	const now = Date.now();
	if (now - lastWarmup < WARM_FOR_MS) return;
	lastWarmup = now;
	httpsCallable(getFunctions(), CloudFunction.SEARCH_TITLES)({ warmup: true }).catch(() => {});
}

/**
 * One batch of title search results from the searchTitles CF — several TMDB pages at once, so a
 * sort covers all of them. Works signed in or not (guests are rate limited per IP)
 */
export function searchTitles(
	query: string,
	scope: MediaFilter,
	batch: number,
): Promise<SearchBatch> {
	return trackApi("cloud_function", CloudFunction.SEARCH_TITLES, async () => {
		const res = await httpsCallable(
			getFunctions(),
			CloudFunction.SEARCH_TITLES,
		)({
			query,
			scope,
			batch,
		});
		return res.data as SearchBatch;
	});
}
