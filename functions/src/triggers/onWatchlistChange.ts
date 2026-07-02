import {
  onDocumentCreated,
  onDocumentDeleted,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onWatchlistAdded = onDocumentCreated(
  "users/{userId}/watchlist/{showId}",
  async (event) => {
    const userId = event.params.userId;
    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.showsTracking": admin.firestore.FieldValue.increment(1),
      });
  }
);

export const onWatchlistRemoved = onDocumentDeleted(
  "users/{userId}/watchlist/{showId}",
  async (event) => {
    const userId = event.params.userId;
    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.showsTracking": admin.firestore.FieldValue.increment(-1),
      });
  }
);
