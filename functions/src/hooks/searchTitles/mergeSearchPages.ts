import {
  MediaType,
  SearchScope,
  SEARCH_MEDIA_TYPES,
  SEARCH_PAGES_PER_BATCH,
  SEARCH_MAX_TMDB_PAGE,
} from "../../shared/enums";
import type { SearchTitle } from "../../shared/types";

/** One TMDB /search/* response */
export interface TmdbSearchPage {
  page: number;
  results: Record<string, unknown>[];
  total_pages: number;
  total_results: number;
}

/** TMDB pages batch `batch` covers, capped at what TMDB will serve */
export function batchPages(batch: number): number[] {
  const first = (batch - 1) * SEARCH_PAGES_PER_BATCH + 1;
  const last = Math.min(batch * SEARCH_PAGES_PER_BATCH, SEARCH_MAX_TMDB_PAGE);
  return Array.from(
    { length: Math.max(0, last - first + 1) },
    (_, i) => first + i,
  );
}

/** Batches needed to cover `totalPages` TMDB pages */
export function batchCount(totalPages: number): number {
  return Math.ceil(
    Math.min(totalPages, SEARCH_MAX_TMDB_PAGE) / SEARCH_PAGES_PER_BATCH,
  );
}

/**
 * A batch's pages as one list in TMDB relevance order: TV shows and movies only (multi search
 * also returns people), media_type filled in for the single-type searches, and each title once
 * (TMDB can repeat one across neighbouring pages)
 */
export function mergeSearchPages(
  pages: TmdbSearchPage[],
  scope: SearchScope,
): SearchTitle[] {
  const seen = new Set<string>();
  const results: SearchTitle[] = [];
  for (const page of [...pages].sort((a, b) => a.page - b.page)) {
    for (const item of page.results) {
      const mediaType =
        scope === SearchScope.ALL ? item.media_type : (scope as string);
      if (
        typeof mediaType !== "string" ||
        !SEARCH_MEDIA_TYPES.includes(mediaType)
      )
        continue;
      if (typeof item.id !== "number") continue;
      const key = `${mediaType}_${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        ...item,
        id: item.id,
        media_type: mediaType as MediaType,
      });
    }
  }
  return results;
}
