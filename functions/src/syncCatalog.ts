// functions/src/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { fetchShowFromTMDB, pooled, CatalogShow } from "./tmdb";
import { getAllTrackerUids } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

export const syncCatalog = onSchedule(
  {
    schedule: "0 3 * * 0", // Every Sunday 3:00 AM UTC
    secrets: [tmdbApiKey],
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 1,
  },
  async () => {
    const db = getFirestore();
    const apiKey = tmdbApiKey.value();

    // Get all TV shows from catalog
    const showsSnap = await db
      .collection("shows")
      .where("mediaType", "==", "tv")
      .get();

    console.log(`Syncing ${showsSnap.size} TV shows`);

    const syncTasks = showsSnap.docs.map(
      (showDoc) => async () => {
        const oldData = showDoc.data() as CatalogShow & {
          trackedBy: string[];
          trackedByCount: number;
        };

        try {
          const freshData = await fetchShowFromTMDB(
            apiKey,
            oldData.tmdbId,
            "tv"
          );

          const oldEpCount = oldData.totalEpisodes ?? 0;
          const newEpCount = freshData.totalEpisodes ?? 0;
          const hasNewContent = newEpCount > oldEpCount;

          // Update catalog doc
          await showDoc.ref.update({
            title: freshData.title,
            posterPath: freshData.posterPath,
            backdropPath: freshData.backdropPath,
            overview: freshData.overview,
            status: freshData.status,
            totalSeasons: freshData.totalSeasons,
            totalEpisodes: freshData.totalEpisodes,
            runtime: freshData.runtime,
            voteAverage: freshData.voteAverage,
            seasons: freshData.seasons,
            lastSyncedAt: FieldValue.serverTimestamp(),
          });

          // If new content found, reactivate completed users
          if (hasNewContent) {
            console.log(
              `New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`
            );
            await reactivateCompletedUsers(
              db,
              showDoc.id,
              freshData
            );
          }
        } catch (err) {
          console.error(
            `Failed to sync show ${oldData.tmdbId} (${oldData.title}):`,
            err
          );
        }
      }
    );

    // Process in batches of 50 to avoid TMDB rate limits
    for (let i = 0; i < syncTasks.length; i += 50) {
      const batch = syncTasks.slice(i, i + 50);
      await pooled(batch, 5);

      // Brief pause between batches to respect rate limits
      if (i + 50 < syncTasks.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log("Catalog sync complete");
  }
);

async function reactivateCompletedUsers(
  db: FirebaseFirestore.Firestore,
  showId: string,
  freshData: CatalogShow
): Promise<void> {
  const allUids = await getAllTrackerUids(showId);

  // Find the first new episode (first ep in the newest season not in old data)
  const lastSeason = freshData.seasons[freshData.seasons.length - 1];
  const firstNewEp = lastSeason?.episodes[0];

  if (!firstNewEp) return;

  const newAirDate = firstNewEp.airDate;
  const airDateTs = newAirDate
    ? Timestamp.fromDate(new Date(newAirDate))
    : Timestamp.now();

  for (const uid of allUids) {
    try {
      const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);
      const trackingDoc = await trackingRef.get();

      if (!trackingDoc.exists) continue;

      const status = trackingDoc.data()?.status;
      if (status !== "completed") continue;

      // Reactivate: set to watching with next episode pointing to new content
      await trackingRef.update({
        status: "watching",
        nextEpisode: {
          season: lastSeason.seasonNumber,
          episode: firstNewEp.episodeNumber,
        },
        priorityDate: airDateTs,
      });

      console.log(
        `Reactivated user ${uid} for show ${freshData.title} S${lastSeason.seasonNumber}E${firstNewEp.episodeNumber}`
      );
    } catch (err) {
      console.error(`Failed to reactivate user ${uid}:`, err);
    }
  }
}
