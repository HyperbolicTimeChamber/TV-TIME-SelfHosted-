// functions/src/addShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "./tmdb";
import { addToTrackedBy } from "./utils";

const tmdbApiKey = defineSecret("TMDB_API_KEY");

interface AddShowRequest {
  tmdbId: number;
  mediaType: "tv" | "movie";
}

export const addShow = onCall(
  {
    secrets: [tmdbApiKey],
    maxInstances: 5,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<CatalogShow> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const { tmdbId, mediaType } = request.data as AddShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
      throw new HttpsError(
        "invalid-argument",
        "tmdbId and mediaType required"
      );
    }

    const db = getFirestore();
    const showId = String(tmdbId);
    const showRef = db.doc(`shows/${showId}`);
    const uid = request.auth.uid;

    // Fetch from TMDB before the transaction so we don't hold a transaction
    // open during a slow network call.
    const apiKey = tmdbApiKey.value();
    const showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);

    // Atomically check-then-create to eliminate the race condition where two
    // concurrent calls both read non-existent and both set.
    let existedBeforeTransaction = false;

    await db.runTransaction(async (tx) => {
      const showDoc = await tx.get(showRef);

      if (showDoc.exists) {
        existedBeforeTransaction = true;
        return; // will call addToTrackedBy outside the transaction
      }

      tx.set(showRef, {
        ...showData,
        trackedBy: [uid],
        trackedByCount: 1,
        lastSyncedAt: FieldValue.serverTimestamp(),
      });
    });

    if (existedBeforeTransaction) {
      await addToTrackedBy(showId, uid);
    }

    return showData;
  }
);
