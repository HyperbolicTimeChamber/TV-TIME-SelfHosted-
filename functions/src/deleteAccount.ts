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

    // Delete all subcollections under user doc
    const subcollections = ["tracking", "watchedEpisodes", "watchedMovies", "upcoming"];
    for (const sub of subcollections) {
      const snap = await db.collection(`users/${uid}/${sub}`).get();
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = db.batch();
        const chunk = snap.docs.slice(i, i + 400);
        for (const doc of chunk) batch.delete(doc.ref);
        await batch.commit();
      }
    }

    // Remove user from trackedBy on all shows they track
    const trackingSnap = await db.collection(`users/${uid}/tracking`).get();
    if (trackingSnap.size > 0) {
      const showRefs = trackingSnap.docs.map((d) => db.doc(`shows/${d.id}`));
      const showDocs = await db.getAll(...showRefs);

      for (const showDoc of showDocs) {
        if (!showDoc.exists) continue;
        const trackedBy: string[] = showDoc.data()?.trackedBy || [];
        const updated = trackedBy.filter((id: string) => id !== uid);
        if (updated.length === 0) {
          const overflowSnap = await showDoc.ref.collection("trackedByOverflow").get();
          const batch = db.batch();
          for (const d of overflowSnap.docs) batch.delete(d.ref);
          batch.delete(showDoc.ref);
          await batch.commit();
        } else {
          await showDoc.ref.update({
            trackedBy: updated,
            trackedByCount: updated.length,
          });
        }
      }
    }

    // Delete user document
    await db.doc(`users/${uid}`).delete();

    // Delete Firebase Auth user
    await getAuth().deleteUser(uid);

    console.log(`[deleteAccount] Deleted user ${uid} and all data`);
    return { success: true };
  }
);
