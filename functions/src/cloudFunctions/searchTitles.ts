import { HttpsError } from "firebase-functions/v2/https";
import { fetchSearchBatch } from "../hooks/searchTitles";
import { RateLimitError } from "../hooks/tmdbProxy";
import { requireCaller } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import {
  Callable,
  FunctionName,
  SearchScope,
  SEARCH_MAX_QUERY_LENGTH,
} from "../shared/enums";
import type {
  SearchTitlesRequest,
  SearchTitlesResponse,
} from "../shared/types";

/**
 * Title search in batches of several TMDB pages, so the client can sort a whole batch (TMDB
 * only orders search results by relevance; sorting page by page reshuffled the list as pages
 * came in).
 * - One instance: its queueing TMDB rate limit, result cache and in-flight dedupe are global
 * - Busy (a TMDB request would queue too long) → resource-exhausted, the client retries later
 */
export const searchTitles = trackedOnCall(
  FunctionName.SEARCH_TITLES,
  {
    maxInstances: 1,
    concurrency: 80,
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 30,
  },
  async (request): Promise<SearchTitlesResponse | null> => {
    requireCaller(request, Callable.SEARCH_TITLES);
    if (request.data?.warmup) return null;

    const { query, scope, batch } = (request.data ?? {}) as SearchTitlesRequest;
    if (
      typeof query !== "string" ||
      !query.trim() ||
      query.length > SEARCH_MAX_QUERY_LENGTH ||
      !Object.values(SearchScope).includes(scope) ||
      !Number.isInteger(batch) ||
      batch < 1
    ) {
      throw new HttpsError(
        "invalid-argument",
        "query, scope and batch required",
      );
    }

    try {
      return await fetchSearchBatch(scope, query, batch);
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new HttpsError(
          "resource-exhausted",
          "Search is busy, try again shortly",
        );
      }
      console.error("[searchTitles] TMDB search failed:", err);
      throw new HttpsError(
        "unavailable",
        "Could not reach TMDB. Try again later.",
      );
    }
  },
);
