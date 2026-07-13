// functions/src/removeShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { removeFromTrackedBy } from "./utils";

interface RemoveShowRequest {
  tmdbId: number;
}

export const removeShow = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tmdbId } = request.data as RemoveShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0) {
      throw new HttpsError("invalid-argument", "tmdbId required");
    }

    const db = getFirestore();
    const uid = request.auth.uid;
    const showId = String(tmdbId);

    // Remove user's tracking doc (keep watchedEpisodes + watchedMovies)
    const trackingRef = db.doc(`users/${uid}/tracking/${showId}`);
    await trackingRef.delete();

    // Update stats
    const userRef = db.doc(`users/${uid}`);
    await userRef.update({
      "stats.showsTracking": FieldValue.increment(-1),
    });

    // Remove from trackedBy, get remaining count
    const remainingCount = await removeFromTrackedBy(showId, uid);

    // If no one tracks it, delete the show doc + overflow subcollection
    if (remainingCount <= 0) {
      const showRef = db.doc(`shows/${showId}`);
      const overflowSnap = await showRef
        .collection("trackedByOverflow")
        .get();
      const batch = db.batch();
      for (const doc of overflowSnap.docs) {
        batch.delete(doc.ref);
      }
      batch.delete(showRef);
      await batch.commit();
    }

    return { success: true };
  }
);
