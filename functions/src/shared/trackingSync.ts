import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  TRACKING_DELETION_TTL_MS,
  TRACKING_UPDATED_AT,
  UserCollection,
} from "./enums";

/**
 * Tracking delta sync, server side (clients stamp their own writes in stampTrackingWrites).
 * Every write to users/{uid}/tracking/{id} must carry `updatedAt`, and every delete must log
 * users/{uid}/trackingDeletions/{id} — or other devices keep a stale saved copy until their
 * daily full fetch.
 */

const TRACKING_PATH = new RegExp(`^users/[^/]+/${UserCollection.TRACKING}/[^/]+$`);

export function isTrackingRef(ref: FirebaseFirestore.DocumentReference): boolean {
  return TRACKING_PATH.test(ref.path);
}

/** Tracking write data + `updatedAt: serverTimestamp()` */
export function stampTracking<T extends FirebaseFirestore.DocumentData>(
  data: T,
): T & { [TRACKING_UPDATED_AT]: FieldValue } {
  return { ...data, [TRACKING_UPDATED_AT]: FieldValue.serverTimestamp() };
}

/** Adds a tracking delete + its deletion log entry to a batch */
export function deleteTracking(
  batch: FirebaseFirestore.WriteBatch,
  ref: FirebaseFirestore.DocumentReference,
): void {
  batch.delete(ref);
  const deletion = ref.parent.parent!.collection(UserCollection.TRACKING_DELETIONS).doc(ref.id);
  batch.set(deletion, {
    [TRACKING_UPDATED_AT]: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(Date.now() + TRACKING_DELETION_TTL_MS),
  });
}
