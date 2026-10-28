import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { DELETION_REQUESTS } from "../shared/enums";

/**
 * Background half of deleteAccount: deletes users/{uid} and every subcollection (tracking,
 * watched history, upcoming) in parallel and takes the uid off the shows it tracked. Catalog
 * docs stay even when nobody tracks them any more — other users still search and add them.
 */
export const purgeUserData = onDocumentCreated(
  {
    document: `${DELETION_REQUESTS}/{uid}`,
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const uid = event.params.uid;
    const db = getFirestore();
    const userRef = db.doc(`users/${uid}`);

    const tracking = await userRef.collection("tracking").select().get();
    const writer = db.bulkWriter();
    for (const d of tracking.docs) {
      // No read/transaction: a show that's gone just fails this one update
      writer
        .update(db.doc(`shows/${d.id}`), {
          trackedBy: FieldValue.arrayRemove(uid),
          trackedByCount: FieldValue.increment(-1),
        })
        .catch(() => {});
    }

    await Promise.all([writer.close(), db.recursiveDelete(userRef)]);
    await event.data?.ref.delete();
    console.log(
      `[purgeUserData] Purged ${uid} (${tracking.size} tracked shows)`,
    );
  },
);
