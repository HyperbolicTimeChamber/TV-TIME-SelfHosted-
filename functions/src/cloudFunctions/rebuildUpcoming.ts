import { getFirestore } from "firebase-admin/firestore";
import { rebuildUserUpcoming } from "../hooks/upcoming";
import { trackedOnCall } from "../hooks/trackedTriggers";
import { FunctionName, Callable } from "../shared/enums";
import { requireCaller } from "../hooks/requireCaller";

export const rebuildUpcoming = trackedOnCall(
  FunctionName.REBUILD_UPCOMING,
  {
    maxInstances: 5,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const uid = requireCaller(request, Callable.REBUILD_UPCOMING);

    const db = getFirestore();
    await rebuildUserUpcoming(db, uid);
    return { success: true };
  },
);
