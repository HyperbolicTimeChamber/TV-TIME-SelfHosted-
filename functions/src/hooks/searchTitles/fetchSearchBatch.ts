import axios from "axios";
import { Agent } from "https";
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
  SEARCH_KEYWORD_FALLBACK_BELOW,
  SEARCH_KEYWORD_MAX,
  MediaType,
} from "../../shared/enums";
import type { SearchTitle, SearchTitlesResponse } from "../../shared/types";
import { keywordMatches, regionAlias } from "./keywordMatch";

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
/** Reused TLS connections: a batch's pages (and the next search) skip the handshake */
const httpsAgent = new Agent({ keepAlive: true });

/**
 * Warmup: the instance's first search used to pay for the Firestore client + API key read and
 * a fresh TMDB TLS connection (~1.5 s vs ~0.25 s warm). Do both while the user is still typing.
 */
export async function primeSearch(): Promise<void> {
  try {
    const apiKey = await getTmdbApiKey();
    await axios.get(`${TMDB_BASE}/configuration`, {
      params: { api_key: apiKey },
      httpsAgent,
      timeout: 5000,
    });
  } catch {
    // Best effort — the real search retries both
  }
}

/** One rate-limited TMDB GET */
async function tmdbGet<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  await limiter.acquire();
  try {
    const { data } = await axios.get<T>(`${TMDB_BASE}${path}`, {
      params: { api_key: await getTmdbApiKey(), ...params },
      httpsAgent,
      timeout: 10000,
    });
    return data;
  } catch (err: any) {
    if (err?.response?.status === 401) invalidateApiKeyCache();
    throw err;
  }
}

function fetchPage(
  scope: SearchScope,
  query: string,
  page: number,
): Promise<TmdbSearchPage> {
  return tmdbGet<TmdbSearchPage>(SEARCH_PATH[scope], { query, page });
}

const DISCOVER_TYPES: Record<SearchScope, MediaType[]> = {
  [SearchScope.ALL]: [MediaType.TV, MediaType.MOVIE],
  [SearchScope.TV]: [MediaType.TV],
  [SearchScope.MOVIE]: [MediaType.MOVIE],
};

/**
 * Few title matches → the most popular titles of what the query names, to stack under them:
 * a regional genre (k-drama, anime → origin country + genre), else TMDB keywords that really
 * are the query (/search/keyword → /discover). Best effort: a failure adds nothing.
 */
async function keywordTitles(
  scope: SearchScope,
  query: string,
): Promise<SearchTitle[]> {
  try {
    const alias = regionAlias(query);
    let types = DISCOVER_TYPES[scope];
    let filter: Record<string, string | number>;
    if (alias) {
      types = types.filter((t) => alias.types.includes(t));
      filter = {
        with_origin_country: alias.country,
        ...(alias.genre ? { with_genres: alias.genre } : {}),
      };
    } else {
      const keywords = await tmdbGet<{ results: { id: number; name: string }[] }>(
        "/search/keyword",
        { query, page: 1 },
      );
      const ids = keywords.results
        .filter((k) => keywordMatches(query, k.name))
        .slice(0, SEARCH_KEYWORD_MAX)
        .map((k) => k.id);
      if (ids.length === 0) return [];
      // Any of the keywords
      filter = { with_keywords: ids.join("|") };
    }
    if (types.length === 0) return [];
    const pages = await Promise.all(
      types.map(async (type) => {
        const page = await tmdbGet<TmdbSearchPage>(`/discover/${type}`, {
          ...filter,
          sort_by: "popularity.desc",
          page: 1,
        });
        return page.results.map((r) => ({ ...r, media_type: type }));
      }),
    );
    // Shows and movies interleaved, each list in popularity order
    const merged: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.max(...pages.map((p) => p.length)); i++) {
      for (const p of pages) if (p[i]) merged.push(p[i]);
    }
    return mergeSearchPages(
      [{ page: 1, results: merged, total_pages: 1, total_results: merged.length }],
      SearchScope.ALL,
    );
  } catch {
    return [];
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
  const results = mergeSearchPages([head, ...tail], scope);
  // A short list (one batch, few matches): titles tagged with the query's keywords go after it
  if (batch === 1 && results.length < SEARCH_KEYWORD_FALLBACK_BELOW) {
    const have = new Set(results.map((r) => `${r.media_type}_${r.id}`));
    const extra = (await keywordTitles(scope, query)).filter(
      (r) => !have.has(`${r.media_type}_${r.id}`),
    );
    if (extra.length > 0) {
      const all = [...results, ...extra];
      return { results: all, batch, totalBatches: 1, totalResults: all.length };
    }
  }
  return {
    results,
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
