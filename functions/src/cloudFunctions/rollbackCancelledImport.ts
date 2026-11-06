import { getFirestore } from "firebase-admin/firestore";
import { FunctionName, JOB_CANCELS_COLLECTION } from "../shared/enums";
import { trackedOnDocumentCreated } from "../hooks/trackedTriggers";
import { rollbackFinishedImport } from "../hooks/importMatches";

/**
 * Background half of cancelAccountJob: a Settings → Import that had already finished when the
 * user cancelled is taken back here, in its own time (the app has already dropped its titles
 * from view; delta sync carries the deletes). A still-running import takes itself back at its
 * next checkpoint, and an export just stops — nothing to do for those.
 */
export const rollbackCancelledImport = trackedOnDocumentCreated(
  FunctionName.ROLLBACK_CANCELLED_IMPORT,
  {
    document: `${JOB_CANCELS_COLLECTION}/{id}`,
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const data = event.data?.data() as { uid?: string; jobId?: string } | undefined;
    if (!data?.uid || !data.jobId) return;
    await rollbackFinishedImport(getFirestore(), data.uid, data.jobId);
  },
);
