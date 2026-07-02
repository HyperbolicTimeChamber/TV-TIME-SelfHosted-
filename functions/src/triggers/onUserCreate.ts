import { beforeUserCreated } from "firebase-functions/v2/identity";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onUserCreate = beforeUserCreated(async (event) => {
  const user = event.data;
  if (!user) return;
  await db.collection("users").doc(user.uid).set({
    displayName: user.displayName || "",
    email: user.email || "",
    photoURL: user.photoURL || "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    stats: {
      episodesWatched: 0,
      showsTracking: 0,
      totalMinutes: 0,
    },
  });
});
