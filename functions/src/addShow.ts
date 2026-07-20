// functions/src/addShow.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { fetchShowFromTMDB, CatalogShow } from "./tmdb";
import { addToTrackedBy } from "./utils";
import { addShowToUpcoming } from "./syncCatalog";
import { showDocId } from "./docId";
import { MediaType } from "./enums";

interface AddShowRequest {
  tmdbId: number;
  mediaType: MediaType;
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
    if (request.data?.warmup) return {} as CatalogShow;

    const { tmdbId, mediaType } = request.data as AddShowRequest;
    if (typeof tmdbId !== "number" || tmdbId <= 0 || !mediaType) {
      throw new HttpsError("invalid-argument", "tmdbId and mediaType required");
    }

    const db = getFirestore();
    const showId = showDocId(tmdbId, mediaType);
    const showRef = db.doc(`shows/${showId}`);
    const uid = request.auth.uid;

    // Fast path: if catalog doc already exists, just add to trackedBy
    const existingDoc = await showRef.get();
    if (existingDoc.exists) {
      await addToTrackedBy(showId, uid);

      // Update upcoming subcollection (fire-and-forget)
      if (mediaType === MediaType.TV) {
        addShowToUpcoming(db, uid, tmdbId, MediaType.TV).catch((err) =>
          console.error("[addShow] upcoming update failed:", err),
        );
      }

      return existingDoc.data() as CatalogShow;
    }

    // Slow path: fetch from TMDB and create catalog doc
    const configDoc = await db.doc("config/app").get();
    const apiKey = configDoc.data()?.tmdbApiKey;
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "TMDB API key not configured",
      );
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
      throw new HttpsError(
        "unavailable",
        "Failed to fetch show data from TMDB",
      );
    }

    // Atomically check-then-create (handles race if two users add simultaneously)
    await db.runTransaction(async (tx) => {
      const showDoc = await tx.get(showRef);

      if (showDoc.exists) {
        return; // another call created it first
      }

      tx.set(showRef, {
        ...showData,
        trackedBy: [uid],
        trackedByCount: 1,
        lastSyncedAt: FieldValue.serverTimestamp(),
      });
    });

    // If doc existed from race, still add to trackedBy
    const afterDoc = await showRef.get();
    const data = afterDoc.data();
    if (data && !(data.trackedBy || []).includes(uid)) {
      await addToTrackedBy(showId, uid);
    }

    // Update upcoming subcollection (fire-and-forget, don't block response)
    if (mediaType === MediaType.TV) {
      addShowToUpcoming(db, uid, tmdbId).catch((err) =>
        console.error("[addShow] upcoming update failed:", err),
      );
    }

    return showData;
  },
);
