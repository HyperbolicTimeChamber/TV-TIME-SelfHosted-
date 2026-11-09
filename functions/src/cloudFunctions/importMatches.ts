import { HttpsError } from "firebase-functions/v2/https";
import { writeUserFacets } from "../hooks/titleFacets";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getTmdbApiKey } from "../hooks/apiKey";
import { rebuildUserUpcoming } from "../hooks/upcoming";
import {
  ensureCatalog,
  buildImportOps,
  acquireImportLock,
  releaseImportLock,
  recordImportJob,
  finishImportJob,
  rollbackImport,
} from "../hooks/importMatches";
import { accountJobId, clearJobCancel, jobCancelled } from "../hooks/jobCancel";
import { commitInBatches, createMissing } from "../hooks/batchWrites";
import { ImportMatch, ImportRequest, ImportStats } from "../shared/types";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { FunctionName, Callable, UserCollection, IMPORT_JOB_FIELD } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";
import { showDocId } from "../shared/docId";

export const importMatches = trackedOnCall(
  FunctionName.IMPORT_MATCHES,
  {
    maxInstances: 5,
    timeoutSeconds: 3600,
    memory: "1GiB",
  },
  async (request): Promise<ImportStats> => {
    const uid = await requireCaller(request, Callable.IMPORT_MATCHES);
    if (request.data?.warmup)
      return {
        showsImported: 0,
        moviesImported: 0,
        episodesImported: 0,
        minutesImported: 0,
      };

    const { matches, keepExisting } = request.data as ImportRequest;
    const jobId = accountJobId((request.data as ImportRequest).jobId);
    if (!matches?.length) {
      throw new HttpsError("invalid-argument", "matches array required");
    }

    const db = getFirestore();
    let apiKey: string;
    try {
      apiKey = await getTmdbApiKey();
    } catch {
      throw new HttpsError(
        "failed-precondition",
        "TMDB API key not configured",
      );
    }

    await acquireImportLock(db, uid);
    try {
      return await runImport(db, uid, apiKey, matches, keepExisting === true, jobId);
    } finally {
      await releaseImportLock(db, uid);
    }
  },
);

async function runImport(
  db: FirebaseFirestore.Firestore,
  uid: string,
  apiKey: string,
  allMatches: ImportMatch[],
  keepExisting: boolean,
  jobId: string | null,
): Promise<ImportStats> {
  // Settings → Import with a job id can be cancelled: between steps it stops and takes back
  // everything it added so far (rollbackImport)
  const checkpoint = async () => {
    if (!(await jobCancelled(uid, jobId))) return;
    await rollbackImport(db, uid, jobId!);
    await clearJobCancel(uid, jobId);
    throw new HttpsError("cancelled", "Import cancelled");
  };
  // Phase 1: Pre-read existing tracking docs (avoid double-counting on re-import) — with their
  // genres / keywords / countries / studios, for the facets rebuild after the import (same reads)
  const existingTrackingIds = new Set<string>();
  const trackingSnap = await db
    .collection(`users/${uid}/tracking`)
    .select("genres", "keywords", "countries", "studios")
    .get();
  for (const d of trackingSnap.docs) {
    existingTrackingIds.add(d.id);
  }
  // Settings → Import (keepExisting): a title already tracked is left exactly as it is — its
  // progress and its history — so a file never overwrites or doubles anything
  const matches = keepExisting
    ? allMatches.filter((m) => !existingTrackingIds.has(showDocId(m.tmdbId, m.mediaType)))
    : allMatches;
  const titlesSkipped = allMatches.length - matches.length;
  if (jobId) {
    await recordImportJob(
      db,
      uid,
      jobId,
      matches.map((m) => showDocId(m.tmdbId, m.mediaType)),
    );
    await checkpoint();
  }

  // Phase 2: Ensure all shows exist in catalog
  const catalogMap = await ensureCatalog(db, uid, apiKey, matches);
  await checkpoint();

  // Phase 3: Build all write operations
  const { writes, history, stats } = buildImportOps(
    db,
    uid,
    matches,
    catalogMap,
    existingTrackingIds,
  );

  // A cancellable import tags what it creates, so the rollback finds exactly that
  if (jobId) {
    for (const w of [...writes, ...history]) w.data[IMPORT_JOB_FIELD] = jobId;
  }

  // Phase 4: Tracking as full WriteBatches; history only where missing, so a re-sync
  // never overwrites in-app rewatch counts and stats only grow by what's new
  const [, created] = await Promise.all([
    commitInBatches(db, writes),
    createMissing(db, history),
  ]);
  // Filter choices: every tracked title's facets — the imported ones as just written
  const titles = new Map(trackingSnap.docs.map((d) => [d.id, d.data()]));
  for (const w of writes) {
    if (w.ref.parent.id === UserCollection.TRACKING) titles.set(w.ref.id, w.data);
  }
  const facetsBatch = db.batch();
  stats.facets = writeUserFacets(
    facetsBatch,
    db,
    uid,
    [...titles].map(([id, d]) => ({
      id,
      genres: d.genres,
      keywords: d.keywords,
      countries: d.countries,
      studios: d.studios,
    })),
  );
  await facetsBatch.commit();
  for (const w of created) {
    if (w.ref.parent.id === "watchedMovies") stats.moviesImported++;
    else stats.episodesImported++;
    stats.minutesImported += w.data.runtime ?? 0;
  }

  // Phase 5: Update user stats
  const userRef = db.doc(`users/${uid}`);
  await userRef.set(
    {
      hasCompletedImport: true,
      // Client whose call errored (timeout / dropped connection) watches this to finish
      lastImportAt: FieldValue.serverTimestamp(),
      stats: {
        episodesWatched: FieldValue.increment(stats.episodesImported),
        moviesWatched: FieldValue.increment(stats.moviesImported),
        totalMinutes: FieldValue.increment(stats.minutesImported),
      },
    },
    { merge: true },
  );

  if (jobId) {
    await finishImportJob(db, uid, jobId, stats);
    await checkpoint();
  }

  // Phase 6: Rebuild upcoming
  await rebuildUserUpcoming(db, uid);

  // A cancel during the rebuild: taken back before "Import Complete" goes out
  await checkpoint();

  // Phase 7: Send FCM notification (non-fatal)
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

  await checkpoint();
  return { ...stats, titlesSkipped };
}
