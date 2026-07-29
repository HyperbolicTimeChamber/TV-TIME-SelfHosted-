import { onCall, HttpsError } from "firebase-functions/v2/https";
import axios from "axios";
import { getTmdbApiKey } from "./utils";

const TMDB_BASE = "https://api.themoviedb.org/3";

type Action =
  | "search"
  | "suggestions"
  | "trending"
  | "showDetails"
  | "seasonDetails"
  | "discoverTV"
  | "discoverMovies"
  | "findByTvdbId";

interface ProxyRequest {
  action: Action;
  warmup?: boolean;
  // search / suggestions
  query?: string;
  page?: number;
  mediaType?: string;
  // showDetails / findByTvdbId
  tmdbId?: number;
  tvdbId?: number;
  // seasonDetails
  seasonNumber?: number;
  // discover
  startDate?: string;
  endDate?: string;
  // trending
  timeWindow?: string;
}

function tmdb(apiKey: string) {
  return axios.create({
    baseURL: TMDB_BASE,
    params: { api_key: apiKey },
  });
}

export const tmdbProxy = onCall(
  {
    maxInstances: 10,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const data = request.data as ProxyRequest;
    if (data?.warmup) return { ok: true };

    const { action } = data;
    if (!action) {
      throw new HttpsError("invalid-argument", "action required");
    }

    const apiKey = await getTmdbApiKey();
    const client = tmdb(apiKey);

    switch (action) {
      case "search": {
        const { query, page = 1, mediaType } = data;
        if (!query) throw new HttpsError("invalid-argument", "query required");
        const endpoint =
          mediaType === "tv"
            ? "/search/tv"
            : mediaType === "movie"
              ? "/search/movie"
              : "/search/multi";
        const res = await client.get(endpoint, { params: { query, page } });
        return {
          results: res.data.results,
          page: res.data.page,
          totalPages: res.data.total_pages,
          totalResults: res.data.total_results,
        };
      }

      case "suggestions": {
        const { query } = data;
        if (!query) throw new HttpsError("invalid-argument", "query required");
        const res = await client.get("/search/multi", {
          params: { query, page: 1 },
        });
        const seen = new Set<string>();
        const names: string[] = [];
        for (const item of res.data.results) {
          const name = (item.name || item.title || "").trim();
          const lower = name.toLowerCase();
          if (name && !seen.has(lower)) {
            seen.add(lower);
            names.push(name);
          }
          if (names.length >= 8) break;
        }
        return { names };
      }

      case "trending": {
        const { mediaType = "tv", timeWindow = "week" } = data;
        const res = await client.get(
          `/trending/${mediaType}/${timeWindow}`,
        );
        return {
          results: res.data.results,
          page: res.data.page,
          totalPages: res.data.total_pages,
        };
      }

      case "showDetails": {
        const { tmdbId, mediaType = "tv" } = data;
        if (!tmdbId)
          throw new HttpsError("invalid-argument", "tmdbId required");
        const res = await client.get(`/${mediaType}/${tmdbId}`, {
          params: { append_to_response: "credits,similar" },
        });
        return res.data;
      }

      case "seasonDetails": {
        const { tmdbId, seasonNumber } = data;
        if (!tmdbId || seasonNumber === undefined)
          throw new HttpsError(
            "invalid-argument",
            "tmdbId and seasonNumber required",
          );
        const res = await client.get(
          `/tv/${tmdbId}/season/${seasonNumber}`,
        );
        return res.data;
      }

      case "discoverTV": {
        const { startDate, endDate } = data;
        if (!startDate || !endDate)
          throw new HttpsError(
            "invalid-argument",
            "startDate and endDate required",
          );
        const ids: number[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 5) {
          const res = await client.get("/discover/tv", {
            params: {
              "air_date.gte": startDate,
              "air_date.lte": endDate,
              page,
            },
          });
          for (const show of res.data.results) ids.push(show.id);
          totalPages = res.data.total_pages;
          page++;
        }
        return { ids };
      }

      case "discoverMovies": {
        const { startDate, endDate } = data;
        if (!startDate || !endDate)
          throw new HttpsError(
            "invalid-argument",
            "startDate and endDate required",
          );
        const movies: Array<{
          id: number;
          title: string;
          poster_path: string | null;
          release_date: string;
        }> = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 5) {
          const res = await client.get("/discover/movie", {
            params: {
              "primary_release_date.gte": startDate,
              "primary_release_date.lte": endDate,
              page,
            },
          });
          for (const m of res.data.results) {
            movies.push({
              id: m.id,
              title: m.title,
              poster_path: m.poster_path,
              release_date: m.release_date,
            });
          }
          totalPages = res.data.total_pages;
          page++;
        }
        return { movies };
      }

      case "findByTvdbId": {
        const { tvdbId } = data;
        if (!tvdbId)
          throw new HttpsError("invalid-argument", "tvdbId required");
        const res = await client.get(`/find/${tvdbId}`, {
          params: { external_source: "tvdb_id" },
        });
        return {
          tvResults: res.data.tv_results ?? [],
          movieResults: res.data.movie_results ?? [],
        };
      }

      default:
        throw new HttpsError("invalid-argument", `Unknown action: ${action}`);
    }
  },
);
