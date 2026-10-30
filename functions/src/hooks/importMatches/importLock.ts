import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { IMPORT_LOCK_MS } from "../../shared/enums";

/**
 * One import per user at a time: a second call (retry after a client timeout, a re-sync
 * tapped twice) would read the same "existing" state and double-count stats.
 */
export async function acquireImportLock(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<void> {
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const held: Timestamp | undefined = (await tx.get(userRef)).data()?.importLockUntil;
    if (held && held.toMillis() > Date.now()) {
      throw new HttpsError("already-exists", "An import is already running");
    }
    tx.set(
      userRef,
      { importLockUntil: Timestamp.fromMillis(Date.now() + IMPORT_LOCK_MS) },
      { merge: true },
    );
  });
}

export async function releaseImportLock(
  db: FirebaseFirestore.Firestore,
  uid: string,
): Promise<void> {
  await db
    .doc(`users/${uid}`)
    .update({ importLockUntil: FieldValue.delete() })
    .catch((e) => console.warn("[importMatches] lock release failed:", e));
}
