import { ENDED_STATUSES, MediaType } from "../../shared/enums";
import { CatalogShow } from "../../shared/types";
import { pooled } from "../tmdb";
import {
  finishedEndedPatch,
  isFinishedEndedShow,
} from "../upcoming/reconcileTracking";

/**
 * One-off: mark ended shows users finished but are still "watching" as completed
 * (the weekly sync handles new cases). Reads ended catalog docs + TV tracking docs.
 */
export async function completeEndedShows(
  db: FirebaseFirestore.Firestore,
  { dryRun }: { dryRun: boolean },
) {
  const ended = await db
    .collection("shows")
    .where("mediaType", "==", MediaType.TV)
    .where("status", "in", ENDED_STATUSES)
    .get();
  const catalogs = new Map(ended.docs.map((d) => [d.id, d.data() as CatalogShow]));
  const users = await db.collection("users").listDocuments();
  const writer = db.bulkWriter();
  const changed: Array<{ uid: string; show: string }> = [];

  await pooled(
    users.map((user) => async () => {
      const tracking = await user
        .collection("tracking")
        .where("mediaType", "==", MediaType.TV)
        .get();
      for (const t of tracking.docs) {
        const catalog = catalogs.get(t.id);
        if (!catalog || !isFinishedEndedShow(t.data(), catalog)) continue;
        changed.push({ uid: user.id, show: catalog.title });
        if (!dryRun) writer.set(t.ref, finishedEndedPatch(), { merge: true });
      }
    }),
    5,
  );
  await writer.close();
  return { endedShows: ended.size, changed };
}
