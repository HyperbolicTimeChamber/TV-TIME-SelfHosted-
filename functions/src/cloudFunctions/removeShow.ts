import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { removeFromTrackedBy } from "../hooks/trackedBy";
import { showDocId } from "../shared/docId";
import { RemoveShowRequest } from "../shared/types";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { FunctionName, Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";

export const removeShow = trackedOnCall(
  FunctionName.REMOVE_SHOW,
  {
    maxInstances: 5,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    const uid = requireCaller(request, Callable.REMOVE_SHOW);
    if (request.data?.warmup) return { success: true };

    const { tmdbId, mediaType } = request.data as RemoveShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
      throw new HttpsError("invalid-argument", "tmdbId and mediaType required");
    }

    const db = getFirestore();
    const showId = showDocId(tmdbId, mediaType);

    // The client already deleted the tracking doc (+ its deletion log entry) and took one off
    // stats.showsTracking (removeFromTracking) — doing either here again counted every removal
    // twice. This only cleans up what the client can't write: upcoming, trackedBy, the catalog

    const upcomingSnap = await db
      .collection(`users/${uid}/upcoming`)
      .where("tmdbShowId", "==", tmdbId)
      .get();
    if (upcomingSnap.size > 0) {
      const batch = db.batch();
      for (const d of upcomingSnap.docs) batch.delete(d.ref);
      await batch.commit();
    }

    // Remove from trackedBy, get remaining count
    const remainingCount = await removeFromTrackedBy(showId, uid);

    // If no one tracks it, delete the show doc + overflow subcollection
    if (remainingCount <= 0) {
      const showRef = db.doc(`shows/${showId}`);
      const overflowSnap = await showRef.collection("trackedByOverflow").get();
      const batch = db.batch();
      for (const doc of overflowSnap.docs) {
        batch.delete(doc.ref);
      }
      batch.delete(showRef);
      await batch.commit();
    }

    return { success: true };
  },
);
