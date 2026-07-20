// functions/src/migrateDocIds.ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { showDocId } from "./docId";
import { MediaType } from "./enums";

export const migrateDocIds = onCall(
  { maxInstances: 1, timeoutSeconds: 3600, memory: "1GiB" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in");

    const db = getFirestore();
    let showsMigrated = 0;
    let trackingMigrated = 0;

    // Helper: commit batches of 500 ops (Firestore limit)
    async function batchMigrate(
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      pathFn: (oldId: string, newId: string) => { oldPath: string; newPath: string },
    ) {
      let batch = db.batch();
      let ops = 0;
      let migrated = 0;

      for (const d of docs) {
        const oldId = d.id;
        if (oldId.startsWith("tv_") || oldId.startsWith("movie_")) continue;

        const data = d.data();
        const mediaType = data.mediaType || MediaType.TV;
        const tmdbId = data.tmdbId || Number(oldId);
        const newId = showDocId(tmdbId, mediaType);
        if (oldId === newId) continue;

        const { oldPath, newPath } = pathFn(oldId, newId);
        batch.set(db.doc(newPath), data);
        batch.delete(db.doc(oldPath));
        ops += 2;
        migrated++;

        if (ops >= 498) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      if (ops > 0) await batch.commit();
      return migrated;
    }

    // 1. Migrate shows/ collection
    console.log("Migrating shows...");
    const showsSnap = await db.collection("shows").get();
    console.log(`Found ${showsSnap.size} shows`);
    showsMigrated = await batchMigrate(showsSnap.docs, (oldId, newId) => ({
      oldPath: `shows/${oldId}`,
      newPath: `shows/${newId}`,
    }));
    console.log(`Migrated ${showsMigrated} shows`);

    // 2. Migrate tracking/ subcollections for all users
    console.log("Migrating tracking docs...");
    const usersSnap = await db.collection("users").get();
    for (const userDoc of usersSnap.docs) {
      const trackingSnap = await db.collection(`users/${userDoc.id}/tracking`).get();
      const userMigrated = await batchMigrate(trackingSnap.docs, (oldId, newId) => ({
        oldPath: `users/${userDoc.id}/tracking/${oldId}`,
        newPath: `users/${userDoc.id}/tracking/${newId}`,
      }));
      trackingMigrated += userMigrated;
      if (userMigrated > 0) {
        console.log(`User ${userDoc.id}: migrated ${userMigrated} tracking docs`);
      }
    }

    console.log(`Migration complete: ${showsMigrated} shows, ${trackingMigrated} tracking`);
    return { showsMigrated, trackingMigrated };
  }
);
