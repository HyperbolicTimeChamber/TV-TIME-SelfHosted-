import axios from "axios";
import { getTmdbApiKey, invalidateApiKeyCache } from "../apiKey";
import { RateLimiter } from "../tmdbProxy";
import { TtlCache } from "./ttlCache";
import {
  batchCount,
  batchPages,
  mergeSearchPages,
  type TmdbSearchPage,
} from "./mergeSearchPages";
import {
  SearchScope,
  TMDB_BASE,
  SEARCH_TMDB_RATE_LIMIT,
  SEARCH_MAX_QUEUE_WAIT_MS,
  SEARCH_CACHE_TTL_MS,
  SEARCH_CACHE_MAX_ENTRIES,
} from "../../shared/enums";
import type { SearchTitlesResponse } from "../../shared/types";

const SEARCH_PATH: Record<SearchScope, string> = {
  [SearchScope.ALL]: "/search/multi",
  [SearchScope.TV]: "/search/tv",
  [SearchScope.MOVIE]: "/search/movie",
};

// One instance (maxInstances 1) → these are global: every TMDB call queues on the same limiter,
// and a batch someone already searched is answered from memory
const limiter = new RateLimiter(
  SEARCH_TMDB_RATE_LIMIT,
  1000,
  SEARCH_MAX_QUEUE_WAIT_MS,
);
const cache = new TtlCache<SearchTitlesResponse>(
  SEARCH_CACHE_TTL_MS,
  SEARCH_CACHE_MAX_ENTRIES,
);
/** Batches being fetched right now: a second caller waits on the same requests */
const inFlight = new Map<string, Promise<SearchTitlesResponse>>();

async function fetchPage(
  scope: SearchScope,
  query: string,
  page: number,
): Promise<TmdbSearchPage> {
  await limiter.acquire();
  try {
    const { data } = await axios.get<TmdbSearchPage>(
      `${TMDB_BASE}${SEARCH_PATH[scope]}`,
      {
        params: { api_key: await getTmdbApiKey(), query, page },
        timeout: 10000,
      },
    );
    return data;
  } catch (err: any) {
    if (err?.response?.status === 401) invalidateApiKeyCache();
    throw err;
  }
}

async function fetchBatch(
  scope: SearchScope,
  query: string,
  batch: number,
): Promise<SearchTitlesResponse> {
  const [first, ...rest] = batchPages(batch);
  if (first === undefined) {
    return { results: [], batch, totalBatches: 0, totalResults: 0 };
  }
  // The first page says how many there are, so a short result list costs one request
  const head = await fetchPage(scope, query, first);
  const more = rest.filter((page) => page <= head.total_pages);
  const tail = await Promise.all(
    more.map((page) => fetchPage(scope, query, page)),
  );
  return {
    results: mergeSearchPages([head, ...tail], scope),
    batch,
    totalBatches: batchCount(head.total_pages),
    totalResults: head.total_results,
  };
}

/** One batch of TMDB search results: memory cache → in-flight request → TMDB (rate limited) */
export function fetchSearchBatch(
  scope: SearchScope,
  query: string,
  batch: number,
): Promise<SearchTitlesResponse> {
  // TMDB search ignores case and surrounding spaces, so "Lost " and "lost" share an entry
  const key = `${scope}|${batch}|${query.trim().toLowerCase()}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = fetchBatch(scope, query.trim(), batch)
    .then((response) => {
      cache.set(key, response);
      return response;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
