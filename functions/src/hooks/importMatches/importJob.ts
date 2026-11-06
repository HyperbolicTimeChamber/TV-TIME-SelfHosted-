import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  IMPORT_JOB_FIELD,
  IMPORT_JOBS_COLLECTION,
  ImportJobStatus,
  UserCollection,
  WRITE_BATCH_SIZE,
} from "../../shared/enums";
import { deleteTracking } from "../../shared/trackingSync";
import type { ImportStats } from "../../shared/types";
import { removeFromTrackedBy } from "../trackedBy";
import { writeUserFacets } from "../titleFacets";
import { rebuildUserUpcoming } from "../upcoming";

const jobRef = (db: Firestore, uid: string, jobId: string) =>
  db.collection(IMPORT_JOBS_COLLECTION).doc(`${uid}_${jobId}`);

/** How long a finished import can still be cancelled (its record kept) */
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

/** The import started: the titles it will add (not tracked before) — trackedBy is undone by them */
export async function recordImportJob(
  db: Firestore,
  uid: string,
  jobId: string,
  titleIds: string[],
): Promise<void> {
  await jobRef(db, uid, jobId).set({
    uid,
    status: ImportJobStatus.RUNNING,
    titleIds,
    expireAt: new Date(Date.now() + JOB_TTL_MS),
  });
}

/** The import's writes are in: its stats increments, to take back on a later cancel */
export async function finishImportJob(
  db: Firestore,
  uid: string,
  jobId: string,
  stats: ImportStats,
): Promise<void> {
  await jobRef(db, uid, jobId).update({
    status: ImportJobStatus.DONE,
    statsApplied: {
      episodesImported: stats.episodesImported,
      moviesImported: stats.moviesImported,
      minutesImported: stats.minutesImported,
    },
  });
}

/** Deletes every doc of a query, a batch at a time */
async function deleteAll(
  db: Firestore,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  remove: (batch: FirebaseFirestore.WriteBatch, ref: FirebaseFirestore.DocumentReference) => void,
): Promise<void> {
  for (let i = 0; i < docs.length; i += WRITE_BATCH_SIZE) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + WRITE_BATCH_SIZE)) remove(batch, d.ref);
    await batch.commit();
  }
}

/**
 * Takes an import back: the tracking / history docs it created (they carry its job id), the
 * stats it added, its trackedBy entries; the filter choices and Upcoming are rebuilt. Titles
 * that were already tracked were never touched (keepExisting), so nothing else changes. Runs
 * once — whoever claims the job first (the import at its checkpoint, or the cancel after the
 * import finished). Returns false when there was nothing to take back.
 */
export async function rollbackImport(db: Firestore, uid: string, jobId: string): Promise<boolean> {
  const ref = jobRef(db, uid, jobId);
  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const status = snap.data()?.status;
    if (!snap.exists || status === ImportJobStatus.ROLLING_BACK || status === ImportJobStatus.ROLLED_BACK) {
      return null;
    }
    tx.update(ref, { status: ImportJobStatus.ROLLING_BACK });
    return snap.data()!;
  });
  if (!job) return false;

  const user = db.doc(`users/${uid}`);
  const [tracking, episodes, movies] = await Promise.all(
    [UserCollection.TRACKING, "watchedEpisodes", "watchedMovies"].map((c) =>
      user.collection(c).where(IMPORT_JOB_FIELD, "==", jobId).get(),
    ),
  );
  await Promise.all([
    deleteAll(db, tracking.docs, (batch, r) => deleteTracking(batch, r)),
    deleteAll(db, [...episodes.docs, ...movies.docs], (batch, r) => batch.delete(r)),
  ]);
  for (const showId of (job.titleIds as string[]) ?? []) {
    await removeFromTrackedBy(showId, uid).catch(() => 0);
  }
  const applied = job.statsApplied as Record<string, number> | undefined;
  if (applied) {
    await user.set(
      {
        stats: {
          episodesWatched: FieldValue.increment(-(applied.episodesImported ?? 0)),
          moviesWatched: FieldValue.increment(-(applied.moviesImported ?? 0)),
          totalMinutes: FieldValue.increment(-(applied.minutesImported ?? 0)),
        },
      },
      { merge: true },
    );
  }
  // Filter choices from the titles left
  const left = await user
    .collection(UserCollection.TRACKING)
    .select("genres", "keywords", "countries", "studios")
    .get();
  const facets = db.batch();
  writeUserFacets(
    facets,
    db,
    uid,
    left.docs.map((d) => ({ id: d.id, ...d.data() })),
  );
  await facets.commit();
  await rebuildUserUpcoming(db, uid);
  await ref.update({ status: ImportJobStatus.ROLLED_BACK });
  console.log(
    `[rollbackImport] ${uid}/${jobId}: ${tracking.size} titles, ${episodes.size} episodes, ${movies.size} movies`,
  );
  return true;
}

/** cancelAccountJob for an import that may already be over: a finished one is taken back now */
export async function rollbackFinishedImport(db: Firestore, uid: string, jobId: string): Promise<void> {
  const snap = await jobRef(db, uid, jobId).get();
  if (snap.data()?.status === ImportJobStatus.DONE) await rollbackImport(db, uid, jobId);
}
