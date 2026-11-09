import type { Firestore } from "firebase-admin/firestore";
import {
  TITLE_CREDITS_COLLECTION,
  TITLE_EXTRAS_COLLECTION,
} from "../../shared/enums";
import type { StoredCastMember, TitleExtrasFields } from "../../shared/types";

/** A title's stored extras: its catalog doc when it has one, else its titleExtras/ doc */
export async function readStoredExtras(db: Firestore, docId: string) {
  const showRef = db.collection("shows").doc(docId);
  const show = await showRef.get();
  if (show.exists) return { ref: showRef, data: show.data() as TitleExtrasFields };
  const ref = db.collection(TITLE_EXTRAS_COLLECTION).doc(docId);
  const doc = await ref.get();
  return { ref, data: (doc.data() ?? {}) as TitleExtrasFields };
}

export const creditsRef = (db: Firestore, docId: string) =>
  db.collection(TITLE_CREDITS_COLLECTION).doc(docId);

/**
 * Everything just fetched in one batch: the missing extras merged onto the title's doc, and the
 * full cast (when the credits were fetched) into titleCredits/
 */
export async function writeExtras(
  db: Firestore,
  ref: FirebaseFirestore.DocumentReference,
  fields: TitleExtrasFields,
  fullCast?: StoredCastMember[],
) {
  const batch = db.batch();
  batch.set(ref, fields, { merge: true });
  if (fullCast) {
    batch.set(creditsRef(db, ref.id), { cast: fullCast, updatedAt: Date.now() });
  }
  await batch.commit();
}
