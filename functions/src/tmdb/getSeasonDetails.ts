import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const SEASON_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_COLLECTION = "cache_seasons";

export const getSeasonDetails = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbId, seasonNumber } = request.data as {
    tmdbId: number;
    seasonNumber: number;
  };
  if (!tmdbId || seasonNumber === undefined) {
    throw new HttpsError(
      "invalid-argument",
      "tmdbId and seasonNumber are required"
    );
  }

  const cacheKey = `${tmdbId}_s${seasonNumber}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, SEASON_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const response = await client.get(
    `/tv/${tmdbId}/season/${seasonNumber}`
  );

  const result = response.data;
  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
