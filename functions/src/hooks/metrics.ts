import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import axios from "axios";
import {
  Firestore,
  Query,
  Transaction,
  WriteBatch,
} from "firebase-admin/firestore";
import {
  AnalyticsEvent,
  ClientPlatform,
  MIXPANEL_DEFAULT_SERVER_URL,
  TMDB_BASE,
  TVMAZE_BASE,
} from "../shared/enums";
import { loadProjectEnv } from "./projectEnv";

const mixpanelToken = () => process.env.MIXPANEL_TOKEN ?? "";
const mixpanelServerUrl = () => process.env.MIXPANEL_SERVER_URL || MIXPANEL_DEFAULT_SERVER_URL;

/**
 * Per-run Firestore + outbound API tallies, sent to Mixpanel when a Cloud Function invocation
 * or a script finishes. Counting hooks the Admin SDK's prototypes once, so no call site
 * changes; AsyncLocalStorage keeps concurrent invocations on one instance apart.
 *
 * Counts approximate billing: query reads count max(docs, 1), writes count when queued (a
 * retried transaction counts its writes again). Query.stream / recursiveDelete reads aren't seen.
 */
interface RunTally {
  reads: number;
  writes: number;
  deletes: number;
  tmdbCalls: number;
  tvmazeCalls: number;
  otherApiCalls: number;
}

type TallyField = keyof RunTally;

const runs = new AsyncLocalStorage<RunTally>();

function count(field: TallyField, n = 1) {
  const tally = runs.getStore();
  if (tally) tally[field] += n;
}

/** Wrap prototype[method] so `after` sees each call's (resolved) result */
function hook(proto: object, method: string, after: (result: unknown) => void) {
  const target = proto as Record<string, (...args: unknown[]) => unknown>;
  const original = target[method];
  target[method] = function (this: unknown, ...args: unknown[]) {
    const result = original.apply(this, args);
    if (result instanceof Promise) {
      return result.then((value) => {
        after(value);
        return value;
      });
    }
    after(result);
    return result;
  };
}

const docCount = (result: unknown) =>
  Array.isArray(result) ? result.length : 1;
// QuerySnapshot has size; an empty query still bills one read
const readCount = (result: unknown) => {
  const size = (result as { size?: unknown } | null)?.size;
  return typeof size === "number" ? Math.max(size, 1) : 1;
};

let installed = false;
function installHooks() {
  if (installed) return;
  installed = true;
  // DocumentReference.get → Firestore.getAll; DocumentReference writes, transactions and
  // BulkWriter all queue through WriteBatch — hooking those alone avoids double counts
  hook(Firestore.prototype, "getAll", (r) => count("reads", docCount(r)));
  hook(Query.prototype, "get", (r) => count("reads", readCount(r)));
  hook(Transaction.prototype, "get", (r) => count("reads", readCount(r)));
  hook(Transaction.prototype, "getAll", (r) => count("reads", docCount(r)));
  for (const method of ["create", "set", "update"]) {
    hook(WriteBatch.prototype, method, () => count("writes"));
  }
  hook(WriteBatch.prototype, "delete", () => count("deletes"));

  axios.interceptors.request.use((config) => {
    const url = config.url ?? "";
    if (url.startsWith(TMDB_BASE)) count("tmdbCalls");
    else if (url.startsWith(TVMAZE_BASE)) count("tvmazeCalls");
    else if (!url.startsWith(mixpanelServerUrl())) count("otherApiCalls");
    return config;
  });
}

export interface MetricsSource {
  /** Function or script name */
  name: string;
  platform: ClientPlatform;
  /** Who asked: the calling client, or SYSTEM for scheduled / triggered work */
  caller: ClientPlatform;
  uid?: string;
}

async function sendRun(
  source: MetricsSource,
  tally: RunTally,
  success: boolean,
  durationMs: number,
) {
  const token = mixpanelToken();
  if (!token) return;
  const base = {
    token,
    time: Date.now(),
    // Empty → not attributed to a user (scheduled jobs, guests, scripts)
    distinct_id: source.uid ?? "",
    client_platform: source.platform,
    caller_platform: source.caller,
    function_name: source.name,
  };
  const events: {
    event: AnalyticsEvent;
    properties: Record<string, unknown>;
  }[] = [
    {
      event: AnalyticsEvent.FUNCTION_INVOKED,
      properties: {
        ...base,
        $insert_id: randomUUID(),
        success,
        duration_ms: durationMs,
        tmdb_calls: tally.tmdbCalls,
        tvmaze_calls: tally.tvmazeCalls,
        other_api_calls: tally.otherApiCalls,
      },
    },
  ];
  const totalOps = tally.reads + tally.writes + tally.deletes;
  if (totalOps > 0) {
    events.push({
      event: AnalyticsEvent.FIRESTORE_OPS,
      properties: {
        ...base,
        $insert_id: randomUUID(),
        reads: tally.reads,
        writes: tally.writes,
        deletes: tally.deletes,
        total_ops: totalOps,
      },
    });
  }
  try {
    await axios.post(`${mixpanelServerUrl()}/track`, events, {
      params: { ip: 0 },
      timeout: 3000,
    });
  } catch (err) {
    console.warn("Mixpanel send failed:", (err as Error).message);
  }
}

const newTally = (): RunTally => ({
  reads: 0,
  writes: 0,
  deletes: 0,
  tmdbCalls: 0,
  tvmazeCalls: 0,
  otherApiCalls: 0,
});

/** Run `fn` with its Firestore / API usage tallied and reported when it settles */
export async function runWithMetrics<T>(
  source: MetricsSource,
  fn: () => Promise<T>,
): Promise<T> {
  installHooks();
  const tally = newTally();
  const start = Date.now();
  let success = false;
  try {
    const result = await runs.run(tally, fn);
    success = true;
    return result;
  } finally {
    // Awaited: a function's CPU is throttled once it returns
    await sendRun(source, tally, success, Date.now() - start);
  }
}

let scriptRun: {
  source: MetricsSource;
  tally: RunTally;
  start: number;
} | null = null;

/**
 * Scripts: call once at the top (after initializeApp). Everything the script runs from here is
 * tallied — works for main() scripts and top-level-await .mjs alike
 */
export function startScriptMetrics(name: string) {
  loadProjectEnv();
  installHooks();
  const tally = newTally();
  runs.enterWith(tally);
  scriptRun = {
    source: {
      name,
      platform: ClientPlatform.SCRIPT,
      caller: ClientPlatform.SYSTEM,
    },
    tally,
    start: Date.now(),
  };
}

/** Scripts: call before process.exit — sends the run's function_invoked / firestore_ops */
export async function finishScriptMetrics(success: boolean) {
  if (!scriptRun) return;
  const { source, tally, start } = scriptRun;
  scriptRun = null;
  await sendRun(source, tally, success, Date.now() - start);
}
