import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getTmdbApiKey } from "../hooks/apiKey";
import { rebuildUserUpcoming } from "../hooks/upcoming";
import {
  ensureCatalog,
  buildImportOps,
  acquireImportLock,
  releaseImportLock,
} from "../hooks/importMatches";
import { commitInBatches, createMissing } from "../hooks/batchWrites";
import { ImportMatch, ImportRequest, ImportStats } from "../shared/types";
import { Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";

export const importMatches = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 3600,
    memory: "1GiB",
  },
  async (request): Promise<ImportStats> => {
    const uid = requireCaller(request, Callable.IMPORT_MATCHES);
    if (request.data?.warmup)
      return {
        showsImported: 0,
        moviesImported: 0,
        episodesImported: 0,
        minutesImported: 0,
      };

    const { matches } = request.data as ImportRequest;
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
      return await runImport(db, uid, apiKey, matches);
    } finally {
      await releaseImportLock(db, uid);
    }
  },
);

async function runImport(
  db: FirebaseFirestore.Firestore,
  uid: string,
  apiKey: string,
  matches: ImportMatch[],
): Promise<ImportStats> {
  // Phase 1: Ensure all shows exist in catalog
  const catalogMap = await ensureCatalog(db, uid, apiKey, matches);

  // Phase 2: Pre-read existing tracking docs (avoid double-counting on re-import)
  const existingTrackingIds = new Set<string>();
  const trackingSnap = await db
    .collection(`users/${uid}/tracking`)
    .select()
    .get();
  for (const d of trackingSnap.docs) {
    existingTrackingIds.add(d.id);
  }

  // Phase 3: Build all write operations
  const { writes, history, stats } = buildImportOps(
    db,
    uid,
    matches,
    catalogMap,
    existingTrackingIds,
  );

  // Phase 4: Tracking as full WriteBatches; history only where missing, so a re-sync
  // never overwrites in-app rewatch counts and stats only grow by what's new
  const [, created] = await Promise.all([
    commitInBatches(db, writes),
    createMissing(db, history),
  ]);
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
        showsTracking: FieldValue.increment(stats.showsImported),
        episodesWatched: FieldValue.increment(stats.episodesImported),
        moviesWatched: FieldValue.increment(stats.moviesImported),
        totalMinutes: FieldValue.increment(stats.minutesImported),
      },
    },
    { merge: true },
  );

  // Phase 6: Rebuild upcoming
  await rebuildUserUpcoming(db, uid);

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

  return stats;
}
