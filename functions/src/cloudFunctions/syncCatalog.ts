import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getTmdbApiKey } from "../hooks/apiKey";
import { rebuildAllUsersUpcoming } from "../hooks/upcoming";
import { fetchCatalogUpdates, batchWriteCatalog } from "../hooks/syncCatalog";
import { fetchShowFromTMDB, pooled } from "../hooks/tmdb";
import { getAllTrackerUids } from "../hooks/trackedBy";
import { healUserShowRuntimes } from "../hooks/runtimeHeal/healRuntimes";
import { MediaType, ENDED_STATUSES, FunctionName } from "../shared/enums";
import { trackedOnSchedule } from "../hooks/trackedTriggers";
import { movieCatalogFields } from "../hooks/catalogFields";

export const syncCatalog = trackedOnSchedule(
  FunctionName.SYNC_CATALOG,
  {
    schedule: "0 3 * * 0", // Every Sunday 3:00 AM UTC
    maxInstances: 1,
    timeoutSeconds: 540,
    memory: "512MiB",
    retryCount: 1,
  },
  async () => {
    const db = getFirestore();
    let apiKey: string;
    try {
      apiKey = await getTmdbApiKey();
    } catch {
      console.error("TMDB API key not configured in config/app");
      return;
    }

    // Phase 1: Read all TV shows
    const showsSnap = await db
      .collection("shows")
      .where("mediaType", "==", MediaType.TV)
      .get();
    console.log(`Syncing ${showsSnap.size} TV shows`);

    // Phase 2: Fetch updates from TMDB
    const {
      freshCatalogMap,
      pendingWrites,
      hasEpisodeRemovals,
      skippedEnded,
      changedShowIds,
      runtimeFills,
    } = await fetchCatalogUpdates(apiKey, showsSnap);
    console.log(`${changedShowIds.length} shows changed`);
    console.log(`Skipped ${skippedEnded} ended/canceled shows`);

    // Phase 3: Batch write catalog updates
    await batchWriteCatalog(db, pendingWrites);

    // Phase 3b: TMDB filled in runtimes → heal trackers' 0-minute watched episodes
    let healedMinutes = 0;
    for (const fill of runtimeFills) {
      const uids = await getAllTrackerUids(fill.showId);
      await pooled(
        uids.map((uid) => async () => {
          healedMinutes += await healUserShowRuntimes(db, uid, fill.tmdbId, fill.runtimes).catch(
            (err) => {
              console.error(`Runtime heal failed for ${uid} / ${fill.showId}:`, err);
              return 0;
            },
          );
        }),
        5,
      );
    }
    if (runtimeFills.length > 0) {
      console.log(`Runtimes filled for ${runtimeFills.length} shows; ${healedMinutes} min healed`);
    }

    // Reactivation of caught-up/completed users happens per user in Phase 6
    // (rebuildUserUpcoming → reconcileTracking).

    // Phase 4b: Sync movie metadata (credits, genres, poster, etc.)
    const moviesSnap = await db
      .collection("shows")
      .where("mediaType", "==", MediaType.MOVIE)
      .get();
    if (moviesSnap.size > 0) {
      console.log(`Syncing ${moviesSnap.size} movies`);
      const movieTasks = moviesSnap.docs.map((movieDoc) => async () => {
        const oldData = movieDoc.data();
        try {
          const fresh = await fetchShowFromTMDB(
            apiKey,
            oldData.tmdbId,
            MediaType.MOVIE,
          );
          await movieDoc.ref.set(
            movieCatalogFields(fresh),
            { merge: true },
          );
        } catch (err) {
          console.error(
            `Failed to sync movie ${oldData.tmdbId} (${oldData.title}):`,
            err,
          );
        }
      });
      await pooled(movieTasks, 5);
      console.log(`Movie sync complete: ${moviesSnap.size} movies`);
    }

    // Phase 5: Build active shows index
    const activeShowIds: string[] = [];
    for (const [id, catalog] of freshCatalogMap) {
      if (!ENDED_STATUSES.includes(catalog.status)) {
        activeShowIds.push(id);
      }
    }
    await db.doc("config/activeShows").set({ ids: activeShowIds });
    console.log(`Active shows index: ${activeShowIds.length} shows`);

    // Phase 6: Rebuild upcoming
    console.log("Rebuilding upcoming episodes...");
    await rebuildAllUsersUpcoming(db, freshCatalogMap, !hasEpisodeRemovals);

    // Phase 7: Write sync timestamp + what changed. Clients whose cache stamp equals
    // previousCatalogSync re-read only changedShowIds (0 reads for unchanged shows);
    // clients further behind re-read all their airing shows once.
    const prevConfig = await db.doc("config/app").get();
    await db.doc("config/app").set(
      {
        previousCatalogSync: prevConfig.data()?.lastCatalogSync ?? null,
        lastCatalogSync: FieldValue.serverTimestamp(),
        changedShowIds,
      },
      { merge: true },
    );

    console.log("Catalog sync complete");
  },
);
