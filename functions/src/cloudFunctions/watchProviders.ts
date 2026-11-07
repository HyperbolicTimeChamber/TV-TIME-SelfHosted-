import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { RateLimiter, RateLimitError } from "../hooks/tmdbProxy";
import { requireCallerOrGuest } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import {
  fetchTmdbWatchProviders,
  normalizeRegion,
  readStoredProviders,
  writeRegionProviders,
} from "../hooks/watchProviders";
import { showDocId } from "../shared/docId";
import {
  Callable,
  COUNTRY_CODE,
  FunctionName,
  MediaType,
  WATCH_PROVIDERS_MAX_QUEUE_WAIT_MS,
  WATCH_PROVIDERS_TMDB_RATE_LIMIT,
} from "../shared/enums";
import type {
  RegionWatchProviders,
  WatchProvidersRequest,
} from "../shared/types";

/** One instance → this TMDB rate limit is global */
const limiter = new RateLimiter(
  WATCH_PROVIDERS_TMDB_RATE_LIMIT,
  1000,
  WATCH_PROVIDERS_MAX_QUEUE_WAIT_MS,
);
/** Same title + country asked for while its TMDB request is in flight → that one answer */
const inFlight = new Map<string, Promise<RegionWatchProviders>>();

async function lookup(
  tmdbId: number,
  mediaType: MediaType,
  region: string,
): Promise<RegionWatchProviders> {
  const db = getFirestore();
  const docId = showDocId(tmdbId, mediaType);
  const { ref, data } = await readStoredProviders(db, docId);
  const stored = data.watchProviders?.[region];
  if (stored) return stored;
  await limiter.acquire();
  const all = await fetchTmdbWatchProviders(
    await getTmdbApiKey(),
    tmdbId,
    mediaType,
  );
  const fresh = normalizeRegion(all[region]);
  // Stored even when empty: the next visitor from this country doesn't ask TMDB again
  await writeRegionProviders(ref, region, fresh);
  return fresh;
}

/**
 * Info page Where to Watch: a title's streaming services in one country.
 * - Public (info pages are): guests are rate limited per IP, users per uid
 * - Firestore first (catalog doc, else watchProviders/); TMDB only for a country not stored yet,
 *   whose answer is stored — empty too — so it's asked once. syncCatalog refreshes stored
 *   countries weekly
 * - One instance: its TMDB rate limit and in-flight dedupe are global
 */
export const watchProviders = trackedOnCall(
  FunctionName.WATCH_PROVIDERS,
  {
    maxInstances: 1,
    concurrency: 80,
    cpu: 1,
    memory: "256MiB",
    timeoutSeconds: 20,
  },
  async (request): Promise<RegionWatchProviders> => {
    requireCallerOrGuest(request, Callable.WATCH_PROVIDERS);
    const { tmdbId, mediaType, region } = (request.data ??
      {}) as WatchProvidersRequest;
    if (
      !Number.isInteger(tmdbId) ||
      tmdbId <= 0 ||
      !Object.values(MediaType).includes(mediaType) ||
      typeof region !== "string" ||
      !COUNTRY_CODE.test(region)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "tmdbId, mediaType and region required",
      );
    }

    const key = `${mediaType}_${tmdbId}_${region}`;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = lookup(tmdbId, mediaType, region).finally(() =>
        inFlight.delete(key),
      );
      inFlight.set(key, pending);
    }
    try {
      return await pending;
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new HttpsError("resource-exhausted", "Busy, try again shortly");
      }
      console.error("[watchProviders] lookup failed:", err);
      throw new HttpsError("unavailable", "Could not reach TMDB. Try again later.");
    }
  },
);
