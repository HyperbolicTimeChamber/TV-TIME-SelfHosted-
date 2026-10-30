import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { CloudFunction, MediaFilter, TMDB_PROXY_KEY } from "../enums";
import { batchCount, batchPages, mergeSearchPages, type SearchBatch } from "../utils/searchBatch";
import { trackApi } from "./analytics";
import { searchMulti } from "./tmdb";

/** CF idle timeout — a warmup inside it would only spend the caller's rate limit */
const WARM_FOR_MS = 15 * 60 * 1000;
let lastWarmup = 0;

/**
 * Start the searchTitles instance while the user is still typing, so the first search doesn't
 * also wait for a cold start. Signed-in only (guests don't use the CF)
 */
export function warmupSearchTitles(apiKey: string | null | undefined) {
	if (!apiKey || apiKey === TMDB_PROXY_KEY) return;
	const now = Date.now();
	if (now - lastWarmup < WARM_FOR_MS) return;
	lastWarmup = now;
	httpsCallable(getFunctions(), CloudFunction.SEARCH_TITLES)({ warmup: true }).catch(() => {});
}

/** Logged-out web: no callable, so the same batch from the (CDN-cached) TMDB proxy pages */
async function guestBatch(query: string, scope: MediaFilter, batch: number): Promise<SearchBatch> {
	const [first, ...rest] = batchPages(batch);
	if (first === undefined) return { results: [], batch, totalBatches: 0, totalResults: 0 };
	const head = await searchMulti(TMDB_PROXY_KEY, query, first, scope);
	const tail = await Promise.all(
		rest
			.filter((page) => page <= head.totalPages)
			.map((page) => searchMulti(TMDB_PROXY_KEY, query, page, scope)),
	);
	return {
		results: mergeSearchPages(
			[head, ...tail].map((p) => p.results),
			scope,
		),
		batch,
		totalBatches: batchCount(head.totalPages),
		totalResults: head.totalResults,
	};
}

/**
 * One batch of title search results — several TMDB pages at once, so a sort covers all of them.
 * Signed in: the searchTitles CF (server key, shared cache, global TMDB rate limit)
 */
export function searchTitles(
	apiKey: string,
	query: string,
	scope: MediaFilter,
	batch: number,
): Promise<SearchBatch> {
	if (apiKey === TMDB_PROXY_KEY) return guestBatch(query, scope, batch);
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
