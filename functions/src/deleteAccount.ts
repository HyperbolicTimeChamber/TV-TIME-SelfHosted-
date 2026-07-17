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
    for (const trackDoc of trackingSnap.docs) {
      const showRef = db.doc(`shows/${trackDoc.id}`);
      const showDoc = await showRef.get();
      if (showDoc.exists) {
        const trackedBy: string[] = showDoc.data()?.trackedBy || [];
        const updated = trackedBy.filter((id) => id !== uid);
        if (updated.length === 0) {
          // No one tracks this show anymore — clean up
          const overflowSnap = await showRef.collection("trackedByOverflow").get();
          const batch = db.batch();
          for (const d of overflowSnap.docs) batch.delete(d.ref);
          batch.delete(showRef);
          await batch.commit();
        } else {
          await showRef.update({
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
