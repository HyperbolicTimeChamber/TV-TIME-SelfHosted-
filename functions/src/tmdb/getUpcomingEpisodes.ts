import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getTmdbClient } from "./client";

export const getUpcomingEpisodes = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }

  const { tmdbIds } = request.data as { tmdbIds: number[] };
  if (!tmdbIds || !Array.isArray(tmdbIds) || tmdbIds.length === 0) {
    throw new HttpsError("invalid-argument", "tmdbIds array is required");
  }

  const client = getTmdbClient();
  const today = new Date().toISOString().split("T")[0];

  const results = await Promise.all(
    tmdbIds.map(async (tmdbId) => {
      try {
        const showRes = await client.get(`/tv/${tmdbId}`);
        const show = showRes.data;
        const episodes: Array<{
          tmdbShowId: number;
          showTitle: string;
          posterPath: string | null;
          season: number;
          episode: number;
          episodeTitle: string;
          airDate: string;
          runtime: number | null;
        }> = [];

        for (const season of show.seasons || []) {
          if (season.season_number === 0) continue;
          try {
            const seasonRes = await client.get(
              `/tv/${tmdbId}/season/${season.season_number}`
            );
            for (const ep of seasonRes.data.episodes || []) {
              if (ep.air_date && ep.air_date >= today) {
                episodes.push({
                  tmdbShowId: tmdbId,
                  showTitle: show.name,
                  posterPath: show.poster_path,
                  season: ep.season_number,
                  episode: ep.episode_number,
                  episodeTitle: ep.name,
                  airDate: ep.air_date,
                  runtime: ep.runtime,
                });
              }
            }
          } catch {
            // Season might not exist yet, skip
          }
        }

        return episodes;
      } catch {
        return [];
      }
    })
  );

  return { episodes: results.flat().sort((a, b) => a.airDate.localeCompare(b.airDate)) };
});
