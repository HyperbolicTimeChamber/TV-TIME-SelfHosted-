import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";

export const searchMulti = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { query, page = 1 } = request.data as {
    query: string;
    page?: number;
  };
  if (!query || typeof query !== "string") {
    throw new HttpsError("invalid-argument", "query is required");
  }

  const client = getTmdbClient();
  const response = await client.get("/search/multi", {
    params: { query, page, include_adult: false },
  });

  const filtered = response.data.results.filter(
    (r: { media_type: string }) =>
      r.media_type === "tv" || r.media_type === "movie"
  );

  return {
    results: filtered,
    page: response.data.page,
    totalPages: response.data.total_pages,
    totalResults: response.data.total_results,
  };
});
