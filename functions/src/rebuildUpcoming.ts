import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { rebuildUserUpcoming } from "./syncCatalog";

export const rebuildUpcoming = onCall(
  {
    maxInstances: 5,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in");
    }

    const db = getFirestore();
    await rebuildUserUpcoming(db, request.auth.uid);
    return { success: true };
  }
);
