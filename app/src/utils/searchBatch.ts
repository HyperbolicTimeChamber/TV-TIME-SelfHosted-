import type { TMDBShow } from "../types/tmdb";

/** One batch of title search results (searchTitles CF) */
export interface SearchBatch {
	/** TV shows + movies in TMDB relevance order, deduped, media_type always set */
	results: TMDBShow[];
	batch: number;
	totalBatches: number;
	totalResults: number;
}
