import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onEpisodeCreated = onDocumentCreated(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.data();
    if (!data) return;

    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.episodesWatched": admin.firestore.FieldValue.increment(1),
        "stats.totalMinutes": admin.firestore.FieldValue.increment(
          data.runtime || 0
        ),
      });
  }
);

export const onEpisodeDeleted = onDocumentDeleted(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const data = event.data?.data();
    if (!data) return;

    await db
      .collection("users")
      .doc(userId)
      .update({
        "stats.episodesWatched": admin.firestore.FieldValue.increment(-1),
        "stats.totalMinutes": admin.firestore.FieldValue.increment(
          -(data.runtime || 0)
        ),
      });
  }
);

export const onEpisodeUpdated = onDocumentUpdated(
  "users/{userId}/watchedEpisodes/{episodeId}",
  async (event) => {
    const userId = event.params.userId;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    if (after.watchCount > before.watchCount) {
      await db
        .collection("users")
        .doc(userId)
        .update({
          "stats.episodesWatched": admin.firestore.FieldValue.increment(1),
          "stats.totalMinutes": admin.firestore.FieldValue.increment(
            after.runtime || 0
          ),
        });
    }
  }
);
