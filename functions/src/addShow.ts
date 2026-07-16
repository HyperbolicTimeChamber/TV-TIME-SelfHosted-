// functions/src/addShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "./tmdb";
import { addToTrackedBy } from "./utils";

interface AddShowRequest {
  tmdbId: number;
  mediaType: "tv" | "movie";
}

export const addShow = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 120,
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

    // Read TMDB key from Firestore config
    const configDoc = await db.doc("config/app").get();
    const apiKey = configDoc.data()?.tmdbApiKey;
    console.log(`[addShow] API key length: ${apiKey?.length}, starts: ${apiKey?.substring(0, 6)}`);
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "TMDB API key not configured");
    }
    let showData: CatalogShow;
    try {
      showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        throw new HttpsError("failed-precondition", "TMDB API key is invalid");
      }
      if (status === 404) {
        throw new HttpsError("not-found", "Show not found on TMDB");
      }
      throw new HttpsError("unavailable", "Failed to fetch show data from TMDB");
    }

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
