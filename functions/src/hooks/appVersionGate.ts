import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  ClientPlatform,
  RELEASE_CONFIG_PATH,
  RELEASE_MINS_TTL_MS,
  ReleaseChannel,
  UPDATE_REQUIRED_MESSAGE,
} from "../shared/enums";

/** Fields the app's callables carry (tagCallable): which build of which channel is calling */
interface CallerBuild {
  clientPlatform?: string;
  appBuild?: number;
  releaseChannel?: string;
}

let mins: Partial<Record<ReleaseChannel, number>> = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;

function refresh(): Promise<void> {
  loading ??= getFirestore()
    .doc(RELEASE_CONFIG_PATH)
    .get()
    .then((snap) => {
      const data = snap.data() ?? {};
      mins = Object.fromEntries(
        Object.values(ReleaseChannel).map((c) => [c, Number(data[c]?.minBuild) || 0]),
      );
      loadedAt = Date.now();
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
  return loading;
}

/**
 * Force update, server side: an app build below its channel's minimum (config/release
 * `{channel}.minBuild`) is refused. Builds from before in-app updates send no build number —
 * once any channel has a minimum, those are refused too. Web and scripts pass. The minimums are
 * cached per instance: one read on its first app call, then a background refresh every
 * RELEASE_MINS_TTL_MS
 */
export async function checkAppVersion(request: CallableRequest): Promise<void> {
  const data = (request.data ?? {}) as CallerBuild;
  if (data.clientPlatform !== ClientPlatform.APP) return;
  if (loadedAt === 0) await refresh();
  else if (Date.now() - loadedAt > RELEASE_MINS_TTL_MS) refresh();
  const channel = data.releaseChannel as ReleaseChannel | undefined;
  const build = Number(data.appBuild) || 0;
  const min = channel ? (mins[channel] ?? 0) : Math.max(0, ...Object.values(mins));
  if (min > 0 && build < min) {
    throw new HttpsError("failed-precondition", UPDATE_REQUIRED_MESSAGE);
  }
}
