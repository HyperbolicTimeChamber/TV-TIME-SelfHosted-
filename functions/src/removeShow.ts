// functions/src/removeShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { removeFromTrackedBy } from "./utils";
import { showDocId } from "./docId";
import { MediaType } from "./enums";

interface RemoveShowRequest {
  tmdbId: number;
  mediaType: MediaType;
}

export const removeShow = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }
    if (request.data?.warmup) return { success: true };

    const { tmdbId, mediaType } = request.data as RemoveShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
      throw new HttpsError("invalid-argument", "tmdbId and mediaType required");
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const showId = showDocId(tmdbId, mediaType);

    // Remove tracking doc + decrement stats in one batch
    const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);
    const userRef = db.doc(`users/${uid}`);
    const userBatch = db.batch();
    userBatch.delete(trackingRef);
    userBatch.set(
      userRef,
      { stats: { showsTracking: FieldValue.increment(-1) } },
      { merge: true },
    );
    await userBatch.commit();

    // Delete upcoming docs for this show
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
