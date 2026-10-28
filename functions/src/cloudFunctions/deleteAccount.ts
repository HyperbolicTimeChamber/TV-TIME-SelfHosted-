import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { DELETION_REQUESTS } from "../shared/enums";

/**
 * Returns in about a second so the app can sign out and move on: queues the uid for
 * purgeUserData (which deletes the data in the background), then deletes the auth user —
 * signing in again later creates a fresh uid, so it never races the purge.
 */
export const deleteAccount = onCall(
  {
    maxInstances: 2,
    timeoutSeconds: 60,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const uid = request.auth.uid;
    // Queue first: if the auth delete fails the data still goes and the client can retry
    await getFirestore()
      .doc(`${DELETION_REQUESTS}/${uid}`)
      .set({ requestedAt: FieldValue.serverTimestamp() });
    // A retry still carries the old (unrevoked) ID token after the user is gone
    await getAuth()
      .deleteUser(uid)
      .catch((e) => {
        if (e?.code !== "auth/user-not-found") throw e;
      });

    console.log(`[deleteAccount] Deleted auth user ${uid}, data purge queued`);
    return { success: true };
  },
);
