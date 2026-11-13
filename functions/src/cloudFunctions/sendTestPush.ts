import { timingSafeEqual } from "crypto";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import {
  APP_UPDATE_MESSAGE,
  ClientPlatform,
  FunctionName,
  RELEASE_CONFIG_PATH,
  ReleaseChannel,
  TEST_PUSH_KEY_HEADER,
  UPDATE_TOPIC,
} from "../shared/enums";
import { trackedOnRequest } from "../hooks/trackedTriggers";

/** `firebase functions:secrets:set TEST_PUSH_KEY` — the PC sends it in TEST_PUSH_KEY_HEADER */
const TEST_PUSH_KEY = defineSecret("TEST_PUSH_KEY");

interface TestPushRequest {
  /** Send to this account's phone (users/{uid}.fcmToken); omitted → the channel's topic */
  email?: string;
  channel?: ReleaseChannel;
}

function keyMatches(given: string | undefined): boolean {
  const expected = Buffer.from(TEST_PUSH_KEY.value());
  const actual = Buffer.from(given ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Test the update notification on a real phone, from a PC (scripts/send-test-push.sh): sends the
 * new-version push for a channel's current release (config/release) to one account's phone or to
 * the whole channel topic. Marked `test`, so the app shows it even when it already has that build
 * (Install downloads the real APK). POST, key in TEST_PUSH_KEY_HEADER — no app user can call it
 */
export const sendTestPush = trackedOnRequest(
  FunctionName.SEND_TEST_PUSH,
  ClientPlatform.SCRIPT,
  { secrets: [TEST_PUSH_KEY], maxInstances: 1 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("POST only");
      return;
    }
    if (!keyMatches(req.get(TEST_PUSH_KEY_HEADER))) {
      res.status(403).send("Bad key");
      return;
    }
    const { email, channel = ReleaseChannel.PROD } = (req.body ?? {}) as TestPushRequest;
    if (!Object.values(ReleaseChannel).includes(channel)) {
      res.status(400).send(`channel must be ${Object.values(ReleaseChannel).join(" | ")}`);
      return;
    }
    const release = (await getFirestore().doc(RELEASE_CONFIG_PATH).get()).get(channel);
    if (!release?.apkUrl) {
      res.status(404).send(`No ${channel} release in ${RELEASE_CONFIG_PATH} yet`);
      return;
    }
    const data = {
      type: APP_UPDATE_MESSAGE,
      test: "1",
      channel,
      version: String(release.version),
      build: String(release.build),
      notes: String(release.notes ?? ""),
      apkUrl: String(release.apkUrl),
      size: String(release.size ?? 0),
    };
    const android = { priority: "high" as const };
    if (email) {
      const user = await getAuth().getUserByEmail(email).catch(() => null);
      const token = user ? (await getFirestore().doc(`users/${user.uid}`).get()).get("fcmToken") : null;
      if (!token) {
        res.status(404).send(`No phone registered for ${email}`);
        return;
      }
      const id = await getMessaging().send({ token, data, android });
      res.json({ sent: id, to: email, channel, version: release.version });
      return;
    }
    const id = await getMessaging().send({ topic: UPDATE_TOPIC[channel], data, android });
    res.json({ sent: id, to: UPDATE_TOPIC[channel], channel, version: release.version });
  },
);
