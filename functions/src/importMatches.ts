// functions/src/importMatches.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { fetchShowFromTMDB, pooled } from "./tmdb";
import { addToTrackedBy } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

interface ImportEpisode {
  season: number;
  episode: number;
  episodeTitle: string;
  watchedAt: string;
  runtime: number;
  watchCount: number;
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
    secrets: [tmdbApiKey],
    maxInstances: 5,
    timeoutSeconds: 540,
    memory: "512MiB",
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
    const apiKey = tmdbApiKey.value();
    const stats: ImportStats = {
      showsImported: 0,
      moviesImported: 0,
      episodesImported: 0,
      minutesImported: 0,
    };

    // Fetch TMDB data for all matches concurrently, then populate catalog
    // using the same transaction pattern as addShow (fetch outside tx,
    // check-and-set inside tx) to avoid races when multiple users import
    // the same show simultaneously.
    const catalogTasks = matches.map(
      (m) => async () => {
        const showId = String(m.tmdbId);
        const showRef = db.doc(`shows/${showId}`);

        // Fetch TMDB data before the transaction to avoid holding it open
        // during a slow network call.
        const showData = await fetchShowFromTMDB(apiKey, m.tmdbId, m.mediaType);

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

    // Build user tracking + watched data batch ops
    const batchOps: Array<() => Promise<void>> = [];
    let totalMinutes = 0;
    let totalEpisodes = 0;

    for (const match of matches) {
      const showId = String(match.tmdbId);
      const now = Timestamp.now();

      // Create tracking doc
      batchOps.push(async () => {
        const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);

        let nextEpisode: { season: number; episode: number } | null = null;
        let lastWatchedAt = now;

        if (match.mediaType === "tv" && match.watchedEpisodes?.length) {
          // Find the latest watched episode by season then episode number
          const sorted = [...match.watchedEpisodes].sort((a, b) => {
            if (a.season !== b.season) return b.season - a.season;
            return b.episode - a.episode;
          });
          const latest = sorted[0];

          nextEpisode = {
            season: latest.season,
            episode: latest.episode + 1,
          };

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

      // Count any TV match as a show imported
      if (match.mediaType === "tv") {
        stats.showsImported++;
      }

      // Create watched episode docs in chunks of 400 (well under the 500-op limit)
      if (match.mediaType === "tv" && match.watchedEpisodes) {
        const eps = match.watchedEpisodes;
        for (let i = 0; i < eps.length; i += 400) {
          const chunk = eps.slice(i, i + 400);
          batchOps.push(async () => {
            const batch = db.batch();
            for (const ep of chunk) {
              const epId = `${match.tmdbId}_S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")}`;
              const epRef = db.doc(`users/${uid}/watchedEpisodes/${epId}`);
              batch.set(epRef, {
                tmdbShowId: match.tmdbId,
                season: ep.season,
                episode: ep.episode,
                episodeTitle: ep.episodeTitle,
                watchCount: ep.watchCount || 1,
                watchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                lastWatchedAt: Timestamp.fromDate(new Date(ep.watchedAt)),
                runtime: ep.runtime || 0,
              });
            }
            await batch.commit();
          });
          totalEpisodes += chunk.length;
          totalMinutes += chunk.reduce((s, e) => s + (e.runtime || 0), 0);
        }
      }

      // Create watched movie doc
      if (match.mediaType === "movie") {
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
            runtime: match.movieRuntime || 0,
          });
        });
        stats.moviesImported++;
        totalMinutes += match.movieRuntime || 0;
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
    await userRef.update({
      hasCompletedImport: true,
      "stats.showsTracking": FieldValue.increment(stats.showsImported),
      "stats.episodesWatched": FieldValue.increment(stats.episodesImported),
      "stats.moviesWatched": FieldValue.increment(stats.moviesImported),
      "stats.totalMinutes": FieldValue.increment(stats.minutesImported),
    });

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
