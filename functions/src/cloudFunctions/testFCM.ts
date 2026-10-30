import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";

export const testFCM = onCall(
  {
    maxInstances: 1,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request): Promise<{ success: boolean }> => {
    const uid = requireCaller(request, Callable.TEST_FCM);

    const db = getFirestore();

    const userDoc = await db.doc(`users/${uid}`).get();
    const fcmToken = userDoc.data()?.fcmToken;

    if (!fcmToken) {
      throw new HttpsError(
        "failed-precondition",
        "No FCM token found. Enable notifications first.",
      );
    }

    const messaging = getMessaging();
    await messaging.send({
      token: fcmToken,
      notification: {
        title: "TV Time Returns",
        body: "Notifications are working!",
      },
      data: {
        type: "test",
      },
    });

    console.log(`[testFCM] Sent test notification to user ${uid}`);
    return { success: true };
  },
);
