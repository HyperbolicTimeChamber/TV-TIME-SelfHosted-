import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { trackedOnDocumentWritten } from "../hooks/trackedTriggers";
import {
  FunctionName,
  GRPC_FAILED_PRECONDITION,
  GRPC_NOT_FOUND,
  TRACKING_DELETION_TTL_MS,
  TRACKING_UPDATED_AT,
  TrackingWriteAction,
  UserCollection,
} from "../shared/enums";
import { trackingWriteAction } from "../shared/trackingSync";

/**
 * Server-side safety net for the watchlist delta sync: clients read only tracking docs whose
 * updatedAt moved since their last sync, plus trackingDeletions entries. Current clients and
 * Cloud Functions stamp their own writes (instant, no extra write) — this covers everything
 * else (app builds from before the delta sync, any writer that forgets):
 * - a write without a new updatedAt → stamped now (only if the doc hasn't changed since)
 * - a delete with no newer deletion log entry → logged, unless the doc is back already
 */
export const trackingSyncStamp = trackedOnDocumentWritten(
  FunctionName.TRACKING_SYNC_STAMP,
  {
    document: `users/{uid}/${UserCollection.TRACKING}/{showId}`,
    region: "europe-west1",
    memory: "256MiB",
    maxInstances: 20,
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    const action = trackingWriteAction(
      before?.exists ? before.data() : undefined,
      after?.exists ? after.data() : undefined,
    );

    if (action === TrackingWriteAction.STAMP && after) {
      // Precondition: a later write to the doc gets its own event — never stamp over it
      await after.ref
        .update(
          { [TRACKING_UPDATED_AT]: FieldValue.serverTimestamp() },
          { lastUpdateTime: after.updateTime },
        )
        .catch((e: { code?: number }) => {
          if (e.code !== GRPC_FAILED_PRECONDITION && e.code !== GRPC_NOT_FOUND) throw e;
        });
      return;
    }

    if (action === TrackingWriteAction.LOG_DELETION && before) {
      const db = getFirestore();
      const deletion = db.doc(
        `users/${event.params.uid}/${UserCollection.TRACKING_DELETIONS}/${event.params.showId}`,
      );
      const lastVersion = before.data()?.[TRACKING_UPDATED_AT] as Timestamp | undefined;
      await db.runTransaction(async (tx) => {
        const [doc, logged] = await Promise.all([tx.get(before.ref), tx.get(deletion)]);
        // Re-added meanwhile → logging it now would delete it on other devices
        if (doc.exists) return;
        // Already logged with the delete (current clients, removeShow)
        const at = logged.data()?.[TRACKING_UPDATED_AT] as Timestamp | undefined;
        if (at && (!lastVersion || at.toMillis() >= lastVersion.toMillis())) return;
        tx.set(deletion, {
          [TRACKING_UPDATED_AT]: FieldValue.serverTimestamp(),
          expireAt: Timestamp.fromMillis(Date.now() + TRACKING_DELETION_TTL_MS),
        });
      });
    }
  },
);
