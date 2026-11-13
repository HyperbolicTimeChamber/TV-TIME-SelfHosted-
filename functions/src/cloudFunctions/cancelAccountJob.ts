import { HttpsError } from "firebase-functions/v2/https";
import { FunctionName, Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { accountJobId, markJobCancelled } from "../hooks/jobCancel";

/**
 * Settings → Export / Import → Cancel: marks the running job (by the id the client gave it)
 * cancelled. An export stops at its next read; an import stops at its next step and takes back
 * what it added. An import that had already finished is taken back by rollbackCancelledImport.
 */
export const cancelAccountJob = trackedOnCall(
  FunctionName.CANCEL_ACCOUNT_JOB,
  {
    maxInstances: 2,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (request): Promise<{ cancelled: boolean }> => {
    const uid = await requireCaller(request, Callable.CANCEL_ACCOUNT_JOB);
    const jobId = accountJobId((request.data as { jobId?: unknown } | undefined)?.jobId);
    if (!jobId) throw new HttpsError("invalid-argument", "jobId required");
    // Returns at once: the running job stops at its next step; an import that had already
    // finished is taken back in the background (rollbackCancelledImport, on this marker)
    await markJobCancelled(uid, jobId);
    return { cancelled: true };
  },
);
