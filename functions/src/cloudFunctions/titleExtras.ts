import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { RateLimiter, RateLimitError } from "../hooks/tmdbProxy";
import { requireCallerOrGuest } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import {
  fillExtras,
  missingExtras,
  readStoredExtras,
  toTitleExtras,
} from "../hooks/titleExtras";
import { showDocId } from "../shared/docId";
import {
  Callable,
  COUNTRY_CODE,
  FunctionName,
  MediaType,
  TITLE_EXTRAS_TMDB_RATE_LIMIT,
} from "../shared/enums";
import type { TitleExtras, TitleExtrasRequest } from "../shared/types";

/** One instance → this TMDB rate limit is global */
const limiter = new RateLimiter(TITLE_EXTRAS_TMDB_RATE_LIMIT, 1000, 8000);
/** Same title + country asked for while its TMDB request is in flight → that one answer */
const inFlight = new Map<string, Promise<TitleExtras>>();

async function lookup(tmdbId: number, mediaType: MediaType, region: string): Promise<TitleExtras> {
  const db = getFirestore();
  const { ref, data } = await readStoredExtras(db, showDocId(tmdbId, mediaType));
  const missing = missingExtras(data, mediaType, region);
  if (!missing.credits && !missing.studios && !missing.providers) {
    return toTitleExtras(data, region);
  }
  await limiter.acquire();
  const filled = await fillExtras(
    db,
    await getTmdbApiKey(),
    ref,
    data,
    tmdbId,
    mediaType,
    region,
  );
  return toTitleExtras(filled, region);
}

/**
 * Info page extras in one call: featured cast (a movie's leads / a show's regulars), directors,
 * studios and the viewer's country's Where to Watch.
 * - Public (info pages are): guests rate limited per IP, users per uid
 * - Firestore first (catalog doc, else titleExtras/); whatever's missing comes from one TMDB
 *   request and is written in one batch (empty answers too — never asked twice); the full cast
 *   goes to titleCredits/ for the View All sheet. syncCatalog refreshes them weekly
 */
export const titleExtras = trackedOnCall(
  FunctionName.TITLE_EXTRAS,
  { maxInstances: 1, concurrency: 80, cpu: 1, memory: "256MiB", timeoutSeconds: 20 },
  async (request): Promise<TitleExtras> => {
    requireCallerOrGuest(request, Callable.TITLE_EXTRAS);
    const { tmdbId, mediaType, region } = (request.data ?? {}) as TitleExtrasRequest;
    if (
      !Number.isInteger(tmdbId) ||
      tmdbId <= 0 ||
      !Object.values(MediaType).includes(mediaType) ||
      typeof region !== "string" ||
      !COUNTRY_CODE.test(region)
    ) {
      throw new HttpsError("invalid-argument", "tmdbId, mediaType and region required");
    }
    const key = `${mediaType}_${tmdbId}_${region}`;
    let pending = inFlight.get(key);
    if (!pending) {
      pending = lookup(tmdbId, mediaType, region).finally(() => inFlight.delete(key));
      inFlight.set(key, pending);
    }
    try {
      return await pending;
    } catch (err) {
      if (err instanceof RateLimitError) {
        throw new HttpsError("resource-exhausted", "Busy, try again shortly");
      }
      console.error("[titleExtras] lookup failed:", err);
      throw new HttpsError("unavailable", "Could not reach TMDB. Try again later.");
    }
  },
);
