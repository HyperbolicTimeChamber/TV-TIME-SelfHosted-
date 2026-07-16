// functions/src/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { fetchShowFromTMDB, pooled, CatalogShow } from "./tmdb";
import { getAllTrackerUids } from "./utils";

export const syncCatalog = onSchedule(
  {
    schedule: "0 3 * * 0", // Every Sunday 3:00 AM UTC
    maxInstances: 1,
    timeoutSeconds: 1800,
    memory: "512MiB",
    retryCount: 1,
  },
  async () => {
    const db = getFirestore();
    const configDoc = await db.doc("config/app").get();
    const apiKey = configDoc.data()?.tmdbApiKey;
    if (!apiKey) {
      console.error("TMDB API key not configured in config/app");
      return;
    }

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

    // Rebuild upcoming subcollections for all users
    console.log("Rebuilding upcoming episodes...");
    await rebuildAllUsersUpcoming(db);

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

async function rebuildAllUsersUpcoming(
  db: FirebaseFirestore.Firestore
): Promise<void> {
  // Get all users who have tracking data
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    try {
      await rebuildUserUpcoming(db, userDoc.id);
    } catch (err) {
      console.error(`Failed to rebuild upcoming for user ${userDoc.id}:`, err);
    }
  }
}

export async function rebuildUserUpcoming(
  db: FirebaseFirestore.Firestore,
  uid: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const upcomingCol = db.collection(`users/${uid}/upcoming`);

  // Delete old upcoming docs
  const oldDocs = await upcomingCol.get();
  if (oldDocs.size > 0) {
    for (let i = 0; i < oldDocs.docs.length; i += 400) {
      const batch = db.batch();
      const chunk = oldDocs.docs.slice(i, i + 400);
      for (const d of chunk) batch.delete(d.ref);
      await batch.commit();
    }
  }

  // Get all active TV tracking docs
  const trackingSnap = await db
    .collection(`users/${uid}/tracking`)
    .where("mediaType", "==", "tv")
    .get();

  const activeStatuses = ["watching", "rewatching"];
  const activeShows = trackingSnap.docs.filter((d) =>
    activeStatuses.includes(d.data().status)
  );

  if (activeShows.length === 0) return;

  // Fetch catalog + build upcoming docs
  const upcomingDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const trackDoc of activeShows) {
    const showDoc = await db.doc(`shows/${trackDoc.id}`).get();
    if (!showDoc.exists) continue;
    const catalog = showDoc.data() as CatalogShow;

    for (const season of catalog.seasons || []) {
      if (season.seasonNumber === 0) continue;
      for (const ep of season.episodes || []) {
        if (!ep.airDate || ep.airDate < today) continue;
        const epId = `${trackDoc.id}_S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        upcomingDocs.push({
          id: epId,
          data: {
            tmdbShowId: catalog.tmdbId ?? Number(trackDoc.id),
            showTitle: catalog.title ?? "",
            posterPath: catalog.posterPath ?? null,
            season: season.seasonNumber,
            episode: ep.episodeNumber,
            episodeTitle: ep.title ?? "",
            airDate: ep.airDate,
            runtime: ep.runtime ?? null,
          },
        });
      }
    }
  }

  // Write in batches of 400
  for (let i = 0; i < upcomingDocs.length; i += 400) {
    const batch = db.batch();
    const chunk = upcomingDocs.slice(i, i + 400);
    for (const d of chunk) {
      batch.set(upcomingCol.doc(d.id), d.data);
    }
    await batch.commit();
  }

  console.log(`Rebuilt ${upcomingDocs.length} upcoming episodes for user ${uid}`);
}
