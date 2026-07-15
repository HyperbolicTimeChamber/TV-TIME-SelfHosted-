// functions/src/importMatches.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { fetchShowFromTMDB, CatalogShow, pooled } from "./tmdb";
import { addToTrackedBy } from "./utils";

interface ImportEpisode {
  season: number;
  episode: number;
  watchedAt: string;
}

interface ImportMatch {
  tmdbId: number;
  mediaType: "tv" | "movie";
  status: "watching" | "completed" | "plan_to_watch";
  watchedEpisodes?: ImportEpisode[];
  movieRuntime?: number;
  movieWatchedAt?: string;
}

interface ImportRequest {
  matches: ImportMatch[];
}

interface ImportStats {
  showsImported: number;
  moviesImported: number;
  episodesImported: number;
  minutesImported: number;
}

export const importMatches = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 3600,
    memory: "1GiB",
  },
  async (request): Promise<ImportStats> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { matches } = request.data as ImportRequest;
    if (!matches?.length) {
      throw new HttpsError("invalid-argument", "matches array required");
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const configDoc = await db.doc("config/app").get();
    const apiKey = configDoc.data()?.tmdbApiKey;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "TMDB API key not configured");
    }
    const stats: ImportStats = {
      showsImported: 0,
      moviesImported: 0,
      episodesImported: 0,
      minutesImported: 0,
    };

    // Fetch TMDB data for all matches and store catalog data for episode enrichment
    const catalogMap = new Map<number, CatalogShow>();

    const catalogTasks = matches.map(
      (m) => async () => {
        const showId = String(m.tmdbId);
        const showRef = db.doc(`shows/${showId}`);

        const showData = await fetchShowFromTMDB(apiKey, m.tmdbId, m.mediaType);
        catalogMap.set(m.tmdbId, showData);

        let existedBeforeTransaction = false;
        await db.runTransaction(async (tx) => {
          const showDoc = await tx.get(showRef);
          if (showDoc.exists) {
            existedBeforeTransaction = true;
            return;
          }
          tx.set(showRef, {
            ...showData,
            trackedBy: [uid],
            trackedByCount: 1,
            lastSyncedAt: FieldValue.serverTimestamp(),
          });
        });

        if (existedBeforeTransaction) {
          await addToTrackedBy(showId, uid);
        }

        return m;
      }
    );

    await pooled(catalogTasks, 5);

    // Helper: look up episode title + runtime from catalog data
    function lookupEpisode(
      tmdbId: number,
      season: number,
      episode: number
    ): { title: string; runtime: number } {
      const catalog = catalogMap.get(tmdbId);
      if (!catalog) return { title: "", runtime: 0 };
      const s = catalog.seasons.find((s) => s.seasonNumber === season);
      if (!s) return { title: "", runtime: catalog.runtime || 0 };
      const ep = s.episodes.find((e) => e.episodeNumber === episode);
      if (!ep) return { title: "", runtime: catalog.runtime || 0 };
      return {
        title: ep.title || "",
        runtime: ep.runtime || catalog.runtime || 0,
      };
    }

    // Build user tracking + watched data batch ops
    const batchOps: Array<() => Promise<void>> = [];
    let totalMinutes = 0;
    let totalEpisodes = 0;

    for (const match of matches) {
      const showId = String(match.tmdbId);
      const now = Timestamp.now();
      const catalog = catalogMap.get(match.tmdbId);

      // Create tracking doc
      batchOps.push(async () => {
        const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);

        let nextEpisode: { season: number; episode: number } | null = null;
        let lastWatchedAt = now;

        if (match.mediaType === "tv" && match.watchedEpisodes?.length) {
          const sorted = [...match.watchedEpisodes].sort((a, b) => {
            if (a.season !== b.season) return b.season - a.season;
            return b.episode - a.episode;
          });
          const latest = sorted[0];

          nextEpisode = {
            season: latest.season,
            episode: latest.episode + 1,
          };

          // Check if latest episode is last in its season — advance to next season
          if (catalog && catalog.seasons) {
            const currentSeason = catalog.seasons.find(
              (s) => s.seasonNumber === latest.season
            );
            if (currentSeason && latest.episode >= currentSeason.episodeCount) {
              const nextSeasonNum = latest.season + 1;
              const nextSeason = catalog.seasons.find(
                (s) => s.seasonNumber === nextSeasonNum
              );
              if (nextSeason) {
                nextEpisode = { season: nextSeasonNum, episode: 1 };
              } else {
                nextEpisode = null; // No more seasons — show is complete
              }
            }
          }

          const latestDate = new Date(latest.watchedAt);
          if (!isNaN(latestDate.getTime())) {
            lastWatchedAt = Timestamp.fromDate(latestDate);
          }
        }

        if (match.mediaType === "movie" && match.movieWatchedAt) {
          const d = new Date(match.movieWatchedAt);
          if (!isNaN(d.getTime())) {
            lastWatchedAt = Timestamp.fromDate(d);
          }
        }

        await trackingRef.set({
          tmdbId: match.tmdbId,
          mediaType: match.mediaType,
          status: match.status,
          nextEpisode,
          rewatchCount: 0,
          addedAt: now,
          lastWatchedAt,
          priorityDate: lastWatchedAt,
        });
      });

      if (match.mediaType === "tv") {
        stats.showsImported++;
      }

      // Create watched episode docs — enrich with TMDB title + runtime
      if (match.mediaType === "tv" && match.watchedEpisodes) {
        const eps = match.watchedEpisodes;
        for (let i = 0; i < eps.length; i += 400) {
          const chunk = eps.slice(i, i + 400);
          batchOps.push(async () => {
            const batch = db.batch();
            for (const ep of chunk) {
              const info = lookupEpisode(match.tmdbId, ep.season, ep.episode);
              const epId = `${match.tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
              const epRef = db.doc(`users/${uid}/watchedEpisodes/${epId}`);
              batch.set(epRef, {
                tmdbShowId: match.tmdbId,
                season: ep.season,
                episode: ep.episode,
                episodeTitle: info.title,
                watchCount: 1,
                watchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                lastWatchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                runtime: info.runtime,
              });
            }
            await batch.commit();
          });
          totalEpisodes += chunk.length;
          totalMinutes += chunk.reduce((s, e) => {
            const info = lookupEpisode(match.tmdbId, e.season, e.episode);
            return s + info.runtime;
          }, 0);
        }
      }

      // Create watched movie doc
      if (match.mediaType === "movie") {
        const movieRuntime = match.movieRuntime || catalog?.runtime || 0;
        batchOps.push(async () => {
          const movieRef = db.doc(`users/${uid}/watchedMovies/${showId}`);
          await movieRef.set({
            tmdbId: match.tmdbId,
            watchCount: 1,
            watchedAt: match.movieWatchedAt
              ? Timestamp.fromDate(new Date(match.movieWatchedAt))
              : now,
            lastWatchedAt: match.movieWatchedAt
              ? Timestamp.fromDate(new Date(match.movieWatchedAt))
              : now,
            runtime: movieRuntime,
          });
        });
        stats.moviesImported++;
        totalMinutes += movieRuntime;
      }
    }

    // Execute batch ops with concurrency limit of 10
    await pooled(
      batchOps.map((op) => () => op()),
      10
    );

    stats.episodesImported = totalEpisodes;
    stats.minutesImported = totalMinutes;

    // Update user stats and mark import complete atomically
    const userRef = db.doc(`users/${uid}`);
    await userRef.set(
      {
        hasCompletedImport: true,
        stats: {
          showsTracking: FieldValue.increment(stats.showsImported),
          episodesWatched: FieldValue.increment(stats.episodesImported),
          moviesWatched: FieldValue.increment(stats.moviesImported),
          totalMinutes: FieldValue.increment(stats.minutesImported),
        },
      },
      { merge: true }
    );

    // Send FCM push notification — non-fatal if it fails
    try {
      const userDoc = await userRef.get();
      const fcmToken = userDoc.data()?.fcmToken;
      if (fcmToken) {
        await getMessaging().send({
          token: fcmToken,
          notification: {
            title: "Import Complete",
            body: `Imported ${stats.showsImported} shows, ${stats.moviesImported} movies, ${stats.episodesImported} episodes`,
          },
          data: {
            type: "import_complete",
            stats: JSON.stringify(stats),
          },
        });
      }
    } catch (e) {
      console.warn("FCM send failed:", e);
    }

    return stats;
  }
);
