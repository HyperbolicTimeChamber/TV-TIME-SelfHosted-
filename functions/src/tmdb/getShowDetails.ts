import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const SHOW_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_COLLECTION = "cache_shows";

export const getShowDetails = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbId, mediaType = "tv" } = request.data as {
    tmdbId: number;
    mediaType?: string;
  };
  if (!tmdbId) {
    throw new HttpsError("invalid-argument", "tmdbId is required");
  }

  const cacheKey = `${mediaType}_${tmdbId}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, SHOW_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const endpoint = mediaType === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  const response = await client.get(endpoint);

  const result = response.data;
  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
