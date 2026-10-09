import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const deleteAccount = onCall(
  {
    maxInstances: 2,
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const uid = request.auth.uid;
    const db = getFirestore();

    // Read tracking FIRST (before deleting) to clean up trackedBy on shows
    const trackingSnap = await db.collection(`users/${uid}/tracking`).get();

    // Remove user from trackedBy on all tracked shows
    if (trackingSnap.size > 0) {
      const showRefs = trackingSnap.docs.map((d) => db.doc(`shows/${d.id}`));
      const showDocs: FirebaseFirestore.DocumentSnapshot[] = [];
      for (let i = 0; i < showRefs.length; i += 500) {
        const chunk = await db.getAll(...showRefs.slice(i, i + 500));
        showDocs.push(...chunk);
      }

      // Batch update/delete shows
      const updateBatch = db.batch();
      const toDeleteWithOverflow: FirebaseFirestore.DocumentReference[] = [];
      for (const showDoc of showDocs) {
        if (!showDoc.exists) continue;
        const trackedBy: string[] = showDoc.data()?.trackedBy || [];
        const updated = trackedBy.filter((id: string) => id !== uid);
        if (updated.length === 0) {
          toDeleteWithOverflow.push(showDoc.ref);
        } else {
          updateBatch.update(showDoc.ref, {
            trackedBy: updated,
            trackedByCount: updated.length,
          });
        }
      }
      await updateBatch.commit();

      // Delete orphaned shows + their overflow subcollections
      for (const ref of toDeleteWithOverflow) {
        const overflowSnap = await ref.collection("trackedByOverflow").get();
        const delBatch = db.batch();
        for (const d of overflowSnap.docs) delBatch.delete(d.ref);
        delBatch.delete(ref);
        await delBatch.commit();
      }
    }

    // Delete all subcollections in parallel
    const subcollections = [
      "tracking",
      "watchedEpisodes",
      "watchedMovies",
      "upcoming",
    ];
    await Promise.all(
      subcollections.map(async (sub) => {
        const snap = await db.collection(`users/${uid}/${sub}`).get();
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = db.batch();
          const chunk = snap.docs.slice(i, i + 400);
          for (const doc of chunk) batch.delete(doc.ref);
          await batch.commit();
        }
      }),
    );

    // Delete user document + Firebase Auth user
    await db.doc(`users/${uid}`).delete();
    await getAuth().deleteUser(uid);

    console.log(`[deleteAccount] Deleted user ${uid} and all data`);
    return { success: true };
  },
);
