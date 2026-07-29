// functions/src/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  fetchShowFromTMDB,
  fetchShowStatus,
  pooled,
  CatalogShow,
} from "./tmdb";
import { getTmdbApiKey } from "./utils";
import { showDocId, parseTmdbId } from "./docId";
import { WatchStatus, MediaType } from "./enums";

export const syncCatalog = onSchedule(
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

    // Get all TV shows from catalog
    const showsSnap = await db
      .collection("shows")
      .where("mediaType", "==", MediaType.TV)
      .get();

    console.log(`Syncing ${showsSnap.size} TV shows`);

    const ENDED_STATUSES = ["Ended", "Canceled"];
    let skippedEnded = 0;
    // Accumulate fresh catalog data during sync — used for upcoming rebuild
    const freshCatalogMap = new Map<string, CatalogShow>();
    let hasEpisodeRemovals = false;

    // Pending catalog writes + reactivations (batched after TMDB fetch loop)
    const pendingWrites: Array<{
      ref: FirebaseFirestore.DocumentReference;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: Record<string, any>;
    }> = [];
    const pendingReactivations: Array<{
      showId: string;
      freshData: CatalogShow;
    }> = [];

    const syncTasks = showsSnap.docs.map((showDoc) => async () => {
      const oldData = showDoc.data() as CatalogShow & {
        trackedBy: string[];
        trackedByCount: number;
      };

      // Ended/canceled: lightweight status check only (1 API call vs ~6)
      if (ENDED_STATUSES.includes(oldData.status)) {
        try {
          const freshStatus = await fetchShowStatus(apiKey, oldData.tmdbId);
          if (ENDED_STATUSES.includes(freshStatus)) {
            freshCatalogMap.set(showDoc.id, oldData);
            skippedEnded++;
            return;
          }
          // Show revived — fall through to full sync
          console.log(
            `Show revived: ${oldData.title} (${oldData.status} → ${freshStatus})`,
          );
        } catch {
          freshCatalogMap.set(showDoc.id, oldData);
          skippedEnded++;
          return;
        }
      }

      try {
        const freshData = await fetchShowFromTMDB(
          apiKey,
          oldData.tmdbId,
          MediaType.TV,
        );

        const oldEpCount = oldData.totalEpisodes ?? 0;
        const newEpCount = freshData.totalEpisodes ?? 0;
        const hasNewContent = newEpCount > oldEpCount;
        if (newEpCount < oldEpCount) hasEpisodeRemovals = true;

        // Queue catalog update (batched after all TMDB fetches)
        pendingWrites.push({
          ref: showDoc.ref,
          data: {
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
            genres: freshData.genres,
            lastSyncedAt: FieldValue.serverTimestamp(),
          },
        });

        freshCatalogMap.set(showDoc.id, freshData);

        if (hasNewContent) {
          console.log(
            `New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`,
          );
          pendingReactivations.push({ showId: showDoc.id, freshData });
        }
      } catch (err) {
        freshCatalogMap.set(showDoc.id, oldData);
        console.error(
          `Failed to sync show ${oldData.tmdbId} (${oldData.title}):`,
          err,
        );
      }
    });

    // Fetch from TMDB in batches of 50 (rate-limited, 5 concurrent)
    for (let i = 0; i < syncTasks.length; i += 50) {
      const chunk = syncTasks.slice(i, i + 50);
      await pooled(chunk, 5);

      // Brief pause between batches to respect rate limits
      if (i + 50 < syncTasks.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(`Skipped ${skippedEnded} ended/canceled shows`);

    // Batch write all catalog updates (500 per batch max)
    // Use set+merge instead of update — safe if doc was deleted mid-sync
    for (let i = 0; i < pendingWrites.length; i += 500) {
      const writeBatch = db.batch();
      const chunk = pendingWrites.slice(i, i + 500);
      for (const { ref, data } of chunk) {
        writeBatch.set(ref, data, { merge: true });
      }
      await writeBatch.commit();
    }
    console.log(`Updated ${pendingWrites.length} catalog docs`);

    // Reactivate completed users for shows with new content (batched)
    if (pendingReactivations.length > 0) {
      // Build map of showId → trackedBy from already-loaded snapshot (0 extra reads)
      const showTrackers = new Map<string, string[]>();
      for (const d of showsSnap.docs) {
        showTrackers.set(d.id, d.data().trackedBy ?? []);
      }

      // Collect all tracking refs to read across all shows
      const reactivationItems: Array<{
        ref: FirebaseFirestore.DocumentReference;
        showId: string;
        freshData: CatalogShow;
      }> = [];

      for (const { showId, freshData } of pendingReactivations) {
        const lastSeason = freshData.seasons[freshData.seasons.length - 1];
        const firstNewEp = lastSeason?.episodes[0];
        if (!firstNewEp) continue;

        const uids = showTrackers.get(showId) ?? [];
        for (const uid of uids) {
          reactivationItems.push({
            ref: db.doc(`users/${uid}/tracking/${showId}`),
            showId,
            freshData,
          });
        }
      }

      if (reactivationItems.length > 0) {
        // Batch read all tracking docs
        const allTrackingDocs: FirebaseFirestore.DocumentSnapshot[] = [];
        for (let i = 0; i < reactivationItems.length; i += 500) {
          const chunk = reactivationItems.slice(i, i + 500);
          const docs = await db.getAll(...chunk.map((r) => r.ref));
          allTrackingDocs.push(...docs);
        }

        // Collect writes for COMPLETED users
        const reactivationWrites: Array<{
          ref: FirebaseFirestore.DocumentReference;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: Record<string, any>;
        }> = [];

        for (let i = 0; i < allTrackingDocs.length; i++) {
          const td = allTrackingDocs[i];
          if (!td.exists || td.data()?.status !== WatchStatus.COMPLETED) continue;

          const { freshData } = reactivationItems[i];
          const lastSeason = freshData.seasons[freshData.seasons.length - 1];
          const firstNewEp = lastSeason.episodes[0];
          const newAirDate = firstNewEp.airDate;
          const airDateTs = newAirDate
            ? Timestamp.fromDate(new Date(newAirDate))
            : Timestamp.now();

          reactivationWrites.push({
            ref: td.ref,
            data: {
              status: WatchStatus.WATCHING,
              nextEpisode: {
                season: lastSeason.seasonNumber,
                episode: firstNewEp.episodeNumber,
              },
              nextEpisodeAirDate: newAirDate ?? null,
              nextEpisodeName: firstNewEp.title ?? null,
              priorityDate: airDateTs,
            },
          });
        }

        // Batch write all reactivations (set+merge: safe if tracking doc deleted)
        for (let i = 0; i < reactivationWrites.length; i += 500) {
          const writeBatch = db.batch();
          const chunk = reactivationWrites.slice(i, i + 500);
          for (const { ref, data } of chunk) {
            writeBatch.set(ref, data, { merge: true });
          }
          await writeBatch.commit();
        }

        if (reactivationWrites.length > 0) {
          console.log(
            `Reactivated ${reactivationWrites.length} users across ${pendingReactivations.length} shows`,
          );
        }
      }
    }

    // Build active shows index from fresh data (reflects status changes from sync)
    const activeShowIds: string[] = [];
    for (const [id, catalog] of freshCatalogMap) {
      if (!ENDED_STATUSES.includes(catalog.status)) {
        activeShowIds.push(id);
      }
    }
    await db.doc("config/activeShows").set({ ids: activeShowIds });
    console.log(`Active shows index: ${activeShowIds.length} shows`);

    // Rebuild upcoming subcollections using fresh catalog data (zero extra reads)
    console.log("Rebuilding upcoming episodes...");
    await rebuildAllUsersUpcoming(db, freshCatalogMap, !hasEpisodeRemovals);

    // Write sync timestamp to config/app so clients know when to rehydrate
    await db
      .doc("config/app")
      .set({ lastCatalogSync: FieldValue.serverTimestamp() }, { merge: true });

    console.log("Catalog sync complete");
  },
);


async function rebuildAllUsersUpcoming(
  db: FirebaseFirestore.Firestore,
  catalogMap: Map<string, CatalogShow>,
  skipOrphanCleanup: boolean,
): Promise<void> {
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    try {
      await rebuildUserUpcoming(db, userDoc.id, catalogMap, skipOrphanCleanup);
    } catch (err) {
      console.error(`Failed to rebuild upcoming for user ${userDoc.id}:`, err);
    }
  }
}

export async function rebuildUserUpcoming(
  db: FirebaseFirestore.Firestore,
  uid: string,
  catalogMap?: Map<string, CatalogShow>,
  skipOrphanCleanup = false,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const upcomingCol = db.collection(`users/${uid}/upcoming`);
  const ENDED_STATUSES = ["Ended", "Canceled"];

  // Read old upcoming + active tracking in parallel (independent queries)
  const [oldDocs, trackingSnap] = await Promise.all([
    upcomingCol.get(),
    db
      .collection(`users/${uid}/tracking`)
      .where("mediaType", "==", MediaType.TV)
      .get(),
  ]);

  const activeStatuses = [WatchStatus.WATCHING, WatchStatus.REWATCHING];
  let activeShows = trackingSnap.docs.filter((d) =>
    activeStatuses.includes(d.data().status),
  );

  if (activeShows.length === 0) return;

  // If no catalog map provided (standalone call), use index + getAll()
  if (!catalogMap) {
    const activeIndexDoc = await db.doc("config/activeShows").get();

    let activeIds: string[];
    if (activeIndexDoc.exists) {
      activeIds = activeIndexDoc.data()?.ids ?? [];
    } else {
      // Build index if it doesn't exist yet
      const allShows = await db
        .collection("shows")
        .where("mediaType", "==", MediaType.TV)
        .get();
      activeIds = allShows.docs
        .filter(
          (d) => !ENDED_STATUSES.includes((d.data() as CatalogShow).status),
        )
        .map((d) => d.id);
      await db.doc("config/activeShows").set({ ids: activeIds });
    }

    const activeIndex = new Set<string>(activeIds);
    activeShows = activeShows.filter((d) => activeIndex.has(d.id));

    if (activeShows.length === 0) return;

    // Batch read catalog docs in chunks of 100
    const refs = activeShows.map((d) => db.doc(`shows/${d.id}`));
    catalogMap = new Map<string, CatalogShow>();
    for (let i = 0; i < refs.length; i += 500) {
      const chunk = refs.slice(i, i + 500);
      const catalogDocs = await db.getAll(...chunk);
      for (const cd of catalogDocs) {
        if (cd.exists) {
          catalogMap.set(cd.id, cd.data() as CatalogShow);
        }
      }
    }
  }

  // Build upcoming docs
  const upcomingDocs: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const trackDoc of activeShows) {
    const catalog = catalogMap.get(trackDoc.id);
    if (!catalog || ENDED_STATUSES.includes(catalog.status)) continue;

    for (const season of catalog.seasons || []) {
      if (season.seasonNumber === 0) continue;
      for (const ep of season.episodes || []) {
        if (!ep.airDate || ep.airDate < today) continue;
        const epId = `${trackDoc.id}_S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
        upcomingDocs.push({
          id: epId,
          data: {
            tmdbShowId: catalog.tmdbId ?? parseTmdbId(trackDoc.id).tmdbId,
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

  // Write new docs first (safe: if this fails, old docs still exist)
  const newDocIds = new Set<string>();
  for (let i = 0; i < upcomingDocs.length; i += 400) {
    const batch = db.batch();
    const chunk = upcomingDocs.slice(i, i + 400);
    for (const d of chunk) {
      batch.set(upcomingCol.doc(d.id), d.data);
      newDocIds.add(d.id);
    }
    await batch.commit();
  }

  // Delete stale docs that aren't in the new set
  const staleIds = oldDocs.docs.filter((d) => !newDocIds.has(d.id));
  for (let i = 0; i < staleIds.length; i += 400) {
    const batch = db.batch();
    const chunk = staleIds.slice(i, i + 400);
    for (const d of chunk) batch.delete(d.ref);
    await batch.commit();
  }

  console.log(
    `Rebuilt ${upcomingDocs.length} upcoming episodes for user ${uid} (removed ${staleIds.length} stale)`,
  );

  // Clean orphaned watchedEpisode docs only when episodes were removed from catalog
  if (!skipOrphanCleanup) {
    await cleanOrphanedEpisodes(db, uid, activeShows, catalogMap);
  }
}

/**
 * Delete watchedEpisode docs whose episode numbers exceed the catalog's
 * episode count for that season (orphans from TMDB/TVDB numbering changes).
 */
async function cleanOrphanedEpisodes(
  db: FirebaseFirestore.Firestore,
  uid: string,
  trackingDocs: FirebaseFirestore.QueryDocumentSnapshot[],
  catalogMap: Map<string, CatalogShow>,
): Promise<void> {
  // Build set of valid season episode counts per show
  const maxEpByShowSeason = new Map<string, Map<number, number>>();
  for (const td of trackingDocs) {
    const catalog = catalogMap.get(td.id);
    if (!catalog?.seasons) continue;
    const seasonMap = new Map<number, number>();
    for (const s of catalog.seasons) {
      if (s.seasonNumber === 0) continue;
      seasonMap.set(s.seasonNumber, s.episodes?.length ?? 0);
    }
    maxEpByShowSeason.set(td.id, seasonMap);
  }

  if (maxEpByShowSeason.size === 0) return;

  // Read all watchedEpisodes for this user
  const watchedSnap = await db
    .collection(`users/${uid}/watchedEpisodes`)
    .get();

  // Pre-build tmdbId → showDocKey lookup (O(S) once instead of O(W×S) scans)
  const tmdbIdToKey = new Map<number, string>();
  for (const [key] of maxEpByShowSeason) {
    const parsed = parseTmdbId(key);
    tmdbIdToKey.set(parsed.tmdbId, key);
  }

  const orphans: FirebaseFirestore.DocumentReference[] = [];
  let orphanRuntime = 0;

  for (const wd of watchedSnap.docs) {
    const data = wd.data();
    const tmdbShowId = data.tmdbShowId;
    const season = data.season;
    const episode = data.episode;
    if (!tmdbShowId || !season || !episode) continue;

    const showDocKey = tmdbIdToKey.get(tmdbShowId);
    if (!showDocKey) continue;

    const seasonMap = maxEpByShowSeason.get(showDocKey)!;
    const maxEp = seasonMap.get(season);

    // Orphan if: season no longer exists in catalog, OR episode number exceeds catalog count
    if (maxEp === undefined || episode > maxEp) {
      orphans.push(wd.ref);
      orphanRuntime += data.runtime || 0;
    }
  }

  if (orphans.length === 0) return;

  // Delete orphans in batches + adjust stats
  for (let i = 0; i < orphans.length; i += 400) {
    const batch = db.batch();
    const chunk = orphans.slice(i, i + 400);
    for (const ref of chunk) batch.delete(ref);
    if (i === 0) {
      batch.set(
        db.doc(`users/${uid}`),
        {
          stats: {
            episodesWatched: FieldValue.increment(-orphans.length),
            totalMinutes: FieldValue.increment(-orphanRuntime),
          },
        },
        { merge: true },
      );
    }
    await batch.commit();
  }

  console.log(
    `Cleaned ${orphans.length} orphaned watchedEpisode docs for user ${uid}`,
  );
}

export async function addShowToUpcoming(
  db: FirebaseFirestore.Firestore,
  uid: string,
  tmdbId: number,
  mediaType: MediaType = MediaType.TV,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const showId = showDocId(tmdbId, mediaType);
  const showDoc = await db.doc(`shows/${showId}`).get();
  if (!showDoc.exists) return;

  const catalog = showDoc.data() as CatalogShow;
  const upcomingCol = db.collection(`users/${uid}/upcoming`);
  const batch = db.batch();
  let count = 0;

  for (const season of catalog.seasons || []) {
    if (season.seasonNumber === 0) continue;
    for (const ep of season.episodes || []) {
      if (!ep.airDate || ep.airDate < today) continue;
      const epId = `${showId}_S${String(season.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`;
      batch.set(upcomingCol.doc(epId), {
        tmdbShowId: catalog.tmdbId ?? tmdbId,
        showTitle: catalog.title ?? "",
        posterPath: catalog.posterPath ?? null,
        season: season.seasonNumber,
        episode: ep.episodeNumber,
        episodeTitle: ep.title ?? "",
        airDate: ep.airDate,
        runtime: ep.runtime ?? null,
      });
      count++;
    }
  }

  if (count > 0) await batch.commit();
}

export async function removeShowFromUpcoming(
  db: FirebaseFirestore.Firestore,
  uid: string,
  tmdbId: number,
): Promise<void> {
  const upcomingSnap = await db
    .collection(`users/${uid}/upcoming`)
    .where("tmdbShowId", "==", tmdbId)
    .get();

  if (upcomingSnap.size === 0) return;

  const batch = db.batch();
  for (const d of upcomingSnap.docs) batch.delete(d.ref);
  await batch.commit();
}
