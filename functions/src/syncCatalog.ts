// functions/src/syncCatalog.ts
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  fetchShowFromTMDB,
  fetchShowStatus,
  pooled,
  CatalogShow,
} from "./tmdb";
import { getAllTrackerUids } from "./utils";
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
    const configDoc = await db.doc("config/app").get();
    const apiKey = configDoc.data()?.tmdbApiKey;
    if (!apiKey) {
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
            skippedEnded++;
            return;
          }
          // Show revived — fall through to full sync
          console.log(
            `Show revived: ${oldData.title} (${oldData.status} → ${freshStatus})`,
          );
        } catch {
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
            `New content for ${freshData.title}: ${oldEpCount} → ${newEpCount} episodes`,
          );
          await reactivateCompletedUsers(db, showDoc.id, freshData);
        }
      } catch (err) {
        console.error(
          `Failed to sync show ${oldData.tmdbId} (${oldData.title}):`,
          err,
        );
      }
    });

    // Process in batches of 50 to avoid TMDB rate limits
    for (let i = 0; i < syncTasks.length; i += 50) {
      const batch = syncTasks.slice(i, i + 50);
      await pooled(batch, 5);

      // Brief pause between batches to respect rate limits
      if (i + 50 < syncTasks.length) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    console.log(`Skipped ${skippedEnded} ended/canceled shows`);

    // Build active shows index (non-ended TV shows)
    const activeShowIds = showsSnap.docs
      .filter((d) => !ENDED_STATUSES.includes((d.data() as CatalogShow).status))
      .map((d) => d.id);
    await db.doc("config/activeShows").set({ ids: activeShowIds });
    console.log(`Active shows index: ${activeShowIds.length} shows`);

    // Build catalog map from already-fetched data (zero extra reads)
    const catalogMap = new Map<string, CatalogShow>();
    for (const d of showsSnap.docs) {
      catalogMap.set(d.id, d.data() as CatalogShow);
    }

    // Rebuild upcoming subcollections for all users
    console.log("Rebuilding upcoming episodes...");
    await rebuildAllUsersUpcoming(db, catalogMap);

    // Write sync timestamp to config/app so clients know when to rehydrate
    await db
      .doc("config/app")
      .set({ lastCatalogSync: FieldValue.serverTimestamp() }, { merge: true });

    console.log("Catalog sync complete");
  },
);

async function reactivateCompletedUsers(
  db: FirebaseFirestore.Firestore,
  showId: string,
  freshData: CatalogShow,
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

  if (allUids.length === 0) return;

  // Batch read tracking docs in chunks of 100
  const trackingRefs = allUids.map((uid) =>
    db.doc(`users/${uid}/tracking/${showId}`),
  );
  const trackingDocs: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let i = 0; i < trackingRefs.length; i += 500) {
    const chunk = await db.getAll(...trackingRefs.slice(i, i + 500));
    trackingDocs.push(...chunk);
  }

  // Batch write reactivations in chunks of 400
  const toReactivate = trackingDocs.filter(
    (d) => d.exists && d.data()?.status === WatchStatus.COMPLETED,
  );

  for (let i = 0; i < toReactivate.length; i += 400) {
    const batch = db.batch();
    const chunk = toReactivate.slice(i, i + 400);
    for (const td of chunk) {
      batch.update(td.ref, {
        status: WatchStatus.WATCHING,
        nextEpisode: {
          season: lastSeason.seasonNumber,
          episode: firstNewEp.episodeNumber,
        },
        nextEpisodeAirDate: newAirDate ?? null,
        nextEpisodeName: firstNewEp.title ?? null,
        priorityDate: airDateTs,
      });
    }
    await batch.commit();
  }

  if (toReactivate.length > 0) {
    console.log(
      `Reactivated ${toReactivate.length} users for ${freshData.title} S${lastSeason.seasonNumber}E${firstNewEp.episodeNumber}`,
    );
  }
}

async function rebuildAllUsersUpcoming(
  db: FirebaseFirestore.Firestore,
  catalogMap: Map<string, CatalogShow>,
): Promise<void> {
  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    try {
      await rebuildUserUpcoming(db, userDoc.id, catalogMap);
    } catch (err) {
      console.error(`Failed to rebuild upcoming for user ${userDoc.id}:`, err);
    }
  }
}

export async function rebuildUserUpcoming(
  db: FirebaseFirestore.Firestore,
  uid: string,
  catalogMap?: Map<string, CatalogShow>,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const upcomingCol = db.collection(`users/${uid}/upcoming`);
  const ENDED_STATUSES = ["Ended", "Canceled"];

  // Read old upcoming docs (delete stale ones AFTER writing new ones)
  const oldDocs = await upcomingCol.get();
  // oldDocs used below to identify stale entries after writing new ones

  // Get all active TV tracking docs
  const trackingSnap = await db
    .collection(`users/${uid}/tracking`)
    .where("mediaType", "==", MediaType.TV)
    .get();

  const activeStatuses = [WatchStatus.WATCHING, WatchStatus.REWATCHING];
  let activeShows = trackingSnap.docs.filter((d) =>
    activeStatuses.includes(d.data().status),
  );

  if (activeShows.length === 0) return;

  // If no catalog map provided (standalone call), use index + getAll()
  if (!catalogMap) {
    let activeIndexDoc = await db.doc("config/activeShows").get();

    // Build index if it doesn't exist yet
    if (!activeIndexDoc.exists) {
      const allShows = await db
        .collection("shows")
        .where("mediaType", "==", MediaType.TV)
        .get();
      const ids = allShows.docs
        .filter(
          (d) => !ENDED_STATUSES.includes((d.data() as CatalogShow).status),
        )
        .map((d) => d.id);
      await db.doc("config/activeShows").set({ ids });
      activeIndexDoc = await db.doc("config/activeShows").get();
    }

    const activeIndex = new Set<string>(activeIndexDoc.data()?.ids ?? []);
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

  // Clean orphaned watchedEpisode docs (episode numbers beyond catalog)
  await cleanOrphanedEpisodes(db, uid, activeShows, catalogMap);
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

  const orphans: FirebaseFirestore.DocumentReference[] = [];
  let orphanRuntime = 0;

  for (const wd of watchedSnap.docs) {
    const data = wd.data();
    const tmdbShowId = data.tmdbShowId;
    const season = data.season;
    const episode = data.episode;
    if (!tmdbShowId || !season || !episode) continue;

    // Find matching catalog entry by tmdbId
    let showDocKey: string | undefined;
    for (const [key] of maxEpByShowSeason) {
      const parsed = parseTmdbId(key);
      if (parsed.tmdbId === tmdbShowId) {
        showDocKey = key;
        break;
      }
    }
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
