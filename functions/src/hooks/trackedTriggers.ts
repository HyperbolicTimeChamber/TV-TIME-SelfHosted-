import type { Response } from "express";
import {
  onCall,
  onRequest,
  type CallableOptions,
  type CallableRequest,
  type HttpsOptions,
  type Request,
} from "firebase-functions/v2/https";
import {
  onSchedule,
  type ScheduleOptions,
  type ScheduledEvent,
} from "firebase-functions/v2/scheduler";
import {
  onDocumentCreated,
  type DocumentOptions,
  type FirestoreEvent,
  type QueryDocumentSnapshot,
} from "firebase-functions/v2/firestore";
import {
  onMessagePublished,
  type MessagePublishedData,
  type PubSubOptions,
} from "firebase-functions/v2/pubsub";
import type { CloudEvent } from "firebase-functions/v2";
import { ClientPlatform, FunctionName } from "../shared/enums";
import { runWithMetrics } from "./metrics";

/**
 * Drop-in replacements for the v2 triggers that report each run to Mixpanel (Firestore ops,
 * outbound API calls, duration, who asked) — see hooks/metrics.
 */

const KNOWN_CALLERS: string[] = [ClientPlatform.APP, ClientPlatform.WEB];

/** Callable: uid from auth, caller from the clientPlatform the app / web sends. Warmups unreported */
export function trackedOnCall<R>(
  name: FunctionName,
  opts: CallableOptions,
  handler: (request: CallableRequest) => Promise<R>,
) {
  return onCall(opts, (request: CallableRequest) => {
    const data = (request.data ?? {}) as {
      warmup?: boolean;
      clientPlatform?: string;
    };
    if (data.warmup) return handler(request);
    const sent = data.clientPlatform ?? "";
    const caller = KNOWN_CALLERS.includes(sent)
      ? (sent as ClientPlatform)
      : ClientPlatform.UNKNOWN;
    return runWithMetrics(
      {
        name,
        platform: ClientPlatform.CLOUD_FUNCTION,
        caller,
        uid: request.auth?.uid,
      },
      () => handler(request),
    );
  });
}

export function trackedOnRequest(
  name: FunctionName,
  caller: ClientPlatform,
  opts: HttpsOptions,
  handler: (req: Request, res: Response) => Promise<void>,
) {
  return onRequest(opts, (req, res) =>
    runWithMetrics(
      { name, platform: ClientPlatform.CLOUD_FUNCTION, caller },
      () => handler(req, res),
    ),
  );
}

export function trackedOnSchedule(
  name: FunctionName,
  opts: ScheduleOptions,
  handler: (event: ScheduledEvent) => Promise<void>,
) {
  return onSchedule(opts, (event) =>
    runWithMetrics(
      {
        name,
        platform: ClientPlatform.CLOUD_FUNCTION,
        caller: ClientPlatform.SYSTEM,
      },
      () => handler(event),
    ),
  );
}

export function trackedOnDocumentCreated(
  name: FunctionName,
  opts: DocumentOptions<string>,
  handler: (
    event: FirestoreEvent<
      QueryDocumentSnapshot | undefined,
      Record<string, string>
    >,
  ) => Promise<unknown>,
) {
  return onDocumentCreated(opts, (event) =>
    runWithMetrics(
      {
        name,
        platform: ClientPlatform.CLOUD_FUNCTION,
        caller: ClientPlatform.SYSTEM,
      },
      () => handler(event),
    ),
  );
}

export function trackedOnMessagePublished<T = unknown>(
  name: FunctionName,
  opts: PubSubOptions,
  handler: (event: CloudEvent<MessagePublishedData<T>>) => Promise<unknown>,
) {
  return onMessagePublished<T>(opts, (event) =>
    runWithMetrics(
      {
        name,
        platform: ClientPlatform.CLOUD_FUNCTION,
        caller: ClientPlatform.SYSTEM,
      },
      () => handler(event),
    ),
  );
}
