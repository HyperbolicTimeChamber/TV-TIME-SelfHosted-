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
    if (!tmdbId || !mediaType) {
      throw new HttpsError(
        "invalid-argument",
        "tmdbId and mediaType required"
      );
    }

    const db = getFirestore();
    const showId = String(tmdbId);
    const showRef = db.doc(`shows/${showId}`);
    const uid = request.auth.uid;

    // Check if show already exists in catalog
    const showDoc = await showRef.get();

    if (showDoc.exists) {
      // Add user to trackedBy
      await addToTrackedBy(showId, uid);
      return showDoc.data() as CatalogShow;
    }

    // Fetch from TMDB and create catalog entry
    const apiKey = tmdbApiKey.value();
    const showData = await fetchShowFromTMDB(apiKey, tmdbId, mediaType);

    await showRef.set({
      ...showData,
      trackedBy: [uid],
      trackedByCount: 1,
      lastSyncedAt: FieldValue.serverTimestamp(),
    });

    return showData;
  }
);
