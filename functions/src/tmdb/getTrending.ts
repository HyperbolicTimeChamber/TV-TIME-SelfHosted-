import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";
import { getCached, setCache } from "./cache";

const TRENDING_TTL = 60 * 60 * 1000; // 1 hour
const CACHE_COLLECTION = "cache_trending";

export const getTrending = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { mediaType = "tv", timeWindow = "week" } = request.data as {
    mediaType?: string;
    timeWindow?: string;
  };

  const cacheKey = `${mediaType}_${timeWindow}`;
  const cached = await getCached(CACHE_COLLECTION, cacheKey, TRENDING_TTL);
  if (cached) return cached;

  const client = getTmdbClient();
  const response = await client.get(`/trending/${mediaType}/${timeWindow}`);

  const result = {
    results: response.data.results,
    page: response.data.page,
    totalPages: response.data.total_pages,
  };

  await setCache(CACHE_COLLECTION, cacheKey, result);
  return result;
});
