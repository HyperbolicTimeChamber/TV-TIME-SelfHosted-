import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { pooled } from "../hooks/tmdb";
import { trackedOnSchedule } from "../hooks/trackedTriggers";
import { airingPushData, utcDate } from "../shared/airDates";
import {
  AIRING_PUSH_TTL_MS,
  FunctionName,
  NOTIFY_RUNS_COLLECTION,
  TITLE_TOPIC_PREFIX,
} from "../shared/enums";
import type { CatalogShow } from "../shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
/** FCM sends in flight at once */
const SEND_POOL = 10;

/**
 * Day-ahead correction push: once a day (00:30 UTC) every title with an episode / release on
 * tomorrow or the day after gets ONE data-only push to its topic `title-{docId}` (devices that
 * track it). The devices' own on-device alarms are primary — this carries changed air times and
 * newly announced episodes. Reads only the airing titles; idempotent per UTC day (notifyRuns)
 */
export const notifyAirings = trackedOnSchedule(
  FunctionName.NOTIFY_AIRINGS,
  {
    schedule: "30 0 * * *",
    timeZone: "UTC",
    maxInstances: 1,
    timeoutSeconds: 300,
    memory: "256MiB",
    retryCount: 1,
  },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const dates = [utcDate(now + DAY_MS), utcDate(now + 2 * DAY_MS)];
    const runRef = db.doc(`${NOTIFY_RUNS_COLLECTION}/${utcDate(now)}`);
    if ((await runRef.get()).get("done") === true) {
      console.log(`Airing pushes for ${utcDate(now)} already sent`);
      return;
    }
    await runRef.set({ startedAt: FieldValue.serverTimestamp(), done: false }, { merge: true });

    const snap = await db.collection("shows").where("airDates14", "array-contains-any", dates).get();
    let sent = 0;
    let failed = 0;
    await pooled(
      snap.docs.map((d) => async () => {
        const data = airingPushData(d.id, d.data() as CatalogShow, dates);
        if (!data) return;
        try {
          await getMessaging().send({
            topic: `${TITLE_TOPIC_PREFIX}${d.id}`,
            data: { ...data },
            android: { priority: "normal", ttl: AIRING_PUSH_TTL_MS },
          });
          sent++;
        } catch (err) {
          failed++;
          console.error(`Airing push failed for ${d.id}:`, err);
        }
      }),
      SEND_POOL,
    );
    console.log(`Airing pushes: ${sent} sent, ${failed} failed, ${snap.size} titles airing on ${dates.join(" / ")}`);
    await runRef.set(
      { done: true, sent, failed, titles: snap.size, finishedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  },
);
