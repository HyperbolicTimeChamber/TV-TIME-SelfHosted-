import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { JOB_CANCELS_COLLECTION } from "../shared/enums";

/** How long a cancel marker is kept for its job to find (an export runs ≤ 5 min, an import ≤ 1 h) */
const CANCEL_TTL_MS = 2 * 60 * 60 * 1000;
const JOB_ID = /^[\w-]{1,64}$/;

/** A client's export / import job id, or null when missing / malformed */
export function accountJobId(raw: unknown): string | null {
  return typeof raw === "string" && JOB_ID.test(raw) ? raw : null;
}

const cancelRef = (uid: string, jobId: string) =>
  getFirestore().collection(JOB_CANCELS_COLLECTION).doc(`${uid}_${jobId}`);

/** cancelAccountJob: leaves the marker the running export / import checks between its steps */
export async function markJobCancelled(uid: string, jobId: string): Promise<void> {
  await cancelRef(uid, jobId).set({
    uid,
    jobId,
    expireAt: new Date(Date.now() + CANCEL_TTL_MS),
  });
}

/** Whether the user cancelled this job. No job id (an old client) → never */
export async function jobCancelled(uid: string, jobId: string | null): Promise<boolean> {
  if (!jobId) return false;
  return (await cancelRef(uid, jobId).get()).exists;
}

/** Between an export's reads: stops (HttpsError "cancelled") once the user cancelled */
export async function throwIfJobCancelled(uid: string, jobId: string | null): Promise<void> {
  if (await jobCancelled(uid, jobId)) {
    await clearJobCancel(uid, jobId);
    throw new HttpsError("cancelled", "Cancelled");
  }
}

/** The job is over: its marker (found, or one that came too late) goes */
export async function clearJobCancel(uid: string, jobId: string | null): Promise<void> {
  if (jobId) await cancelRef(uid, jobId).delete().catch(() => {});
}
