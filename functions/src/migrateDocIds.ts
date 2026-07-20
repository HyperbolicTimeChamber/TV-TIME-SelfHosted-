// functions/src/migrateDocIds.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { showDocId } from "./docId";

export const migrateDocIds = onCall(
  { maxInstances: 1, timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const db = getFirestore();
    let showsMigrated = 0;
    let trackingMigrated = 0;

    // 1. Migrate shows/ collection
    const showsSnap = await db.collection("shows").get();
    for (const showDoc of showsSnap.docs) {
      const oldId = showDoc.id;
      if (oldId.startsWith("tv_") || oldId.startsWith("movie_")) continue;

      const data = showDoc.data();
      const mediaType = data.mediaType || "tv";
      const tmdbId = data.tmdbId || Number(oldId);
      const newId = showDocId(tmdbId, mediaType);

      if (oldId === newId) continue;

      await db.doc(`shows/${newId}`).set(data);
      await db.doc(`shows/${oldId}`).delete();
      showsMigrated++;
    }

    // 2. Migrate tracking/ subcollections for all users
    const usersSnap = await db.collection("users").get();
    for (const userDoc of usersSnap.docs) {
      const trackingSnap = await db.collection(`users/${userDoc.id}/tracking`).get();
      for (const trackDoc of trackingSnap.docs) {
        const oldId = trackDoc.id;
        if (oldId.startsWith("tv_") || oldId.startsWith("movie_")) continue;

        const data = trackDoc.data();
        const mediaType = data.mediaType || "tv";
        const tmdbId = data.tmdbId || Number(oldId);
        const newId = showDocId(tmdbId, mediaType);

        if (oldId === newId) continue;

        await db.doc(`users/${userDoc.id}/tracking/${newId}`).set(data);
        await db.doc(`users/${userDoc.id}/tracking/${oldId}`).delete();
        trackingMigrated++;
      }
    }

    return { showsMigrated, trackingMigrated };
  }
);
