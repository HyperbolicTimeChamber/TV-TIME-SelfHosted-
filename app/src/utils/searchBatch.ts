import { MediaFilter, MediaType, SEARCH_MAX_TMDB_PAGE, SEARCH_PAGES_PER_BATCH } from "../enums";
import type { TMDBShow } from "../types/tmdb";

/** One batch of title search results (searchTitles CF, or the guest path's own fetch) */
export interface SearchBatch {
	/** TV shows + movies in TMDB relevance order, deduped, media_type always set */
	results: TMDBShow[];
	batch: number;
	totalBatches: number;
	totalResults: number;
}

/** TMDB pages batch `batch` covers (same split as the searchTitles CF) */
export function batchPages(batch: number): number[] {
	const first = (batch - 1) * SEARCH_PAGES_PER_BATCH + 1;
	const last = Math.min(batch * SEARCH_PAGES_PER_BATCH, SEARCH_MAX_TMDB_PAGE);
	return Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i);
}

export const batchCount = (totalPages: number) =>
	Math.ceil(Math.min(totalPages, SEARCH_MAX_TMDB_PAGE) / SEARCH_PAGES_PER_BATCH);

const TITLE_TYPES: string[] = [MediaType.TV, MediaType.MOVIE];

/**
 * Pages (in page order) as one list, as the searchTitles CF builds it: TV + movies only (multi
 * search also returns people), media_type filled in, each title once
 */
export function mergeSearchPages(pages: TMDBShow[][], scope: MediaFilter): TMDBShow[] {
	const seen = new Set<string>();
	const results: TMDBShow[] = [];
	for (const item of pages.flat()) {
		const mediaType = scope === MediaFilter.ALL ? item.media_type : (scope as string);
		if (!mediaType || !TITLE_TYPES.includes(mediaType)) continue;
		const key = `${mediaType}_${item.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		results.push({ ...item, media_type: mediaType as MediaType });
	}
	return results;
}
