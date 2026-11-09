import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineBoolean } from "firebase-functions/params";
import { KeyedRateLimiter } from "./keyedRateLimit";
import { Callable, CALLABLE_RATE_LIMITS } from "../shared/enums";
import { checkAppVersion } from "./appVersionGate";

/**
 * true → callables reject requests without a valid App Check token. Only flip once the app
 * build that ships App Check is what people run (older builds send no token and would break).
 * Can't use onCall's static `enforceAppCheck` for this: it doesn't take a param.
 */
export const ENFORCE_CALLABLE_APP_CHECK = defineBoolean(
  "ENFORCE_CALLABLE_APP_CHECK",
  {
    default: false,
  },
);

const limiters = new Map<Callable, KeyedRateLimiter>();

function limiterFor(fn: Callable) {
  let limiter = limiters.get(fn);
  if (!limiter) {
    const { limit, windowMs } = CALLABLE_RATE_LIMITS[fn];
    limiter = new KeyedRateLimiter(limit, windowMs);
    limiters.set(fn, limiter);
  }
  return limiter;
}

function checkAppCheck(request: CallableRequest) {
  // request.app is only set for a verified token (an invalid one is rejected by the SDK)
  if (ENFORCE_CALLABLE_APP_CHECK.value() && !request.app) {
    throw new HttpsError("failed-precondition", "App Check token required");
  }
}

function checkRate(fn: Callable, key: string) {
  if (!limiterFor(fn).hit(key)) {
    throw new HttpsError("resource-exhausted", "Too many requests, slow down");
  }
}

/**
 * The caller's IP. Google's front end appends the address it saw to X-Forwarded-For, so the
 * last entry is the real one (earlier entries are whatever the client sent)
 */
export function callerIp(request: CallableRequest): string {
  const header = request.rawRequest?.headers["x-forwarded-for"];
  const value = Array.isArray(header) ? header.join(",") : header;
  const last = value?.split(",").pop()?.trim();
  return last || request.rawRequest?.ip || "unknown";
}

/**
 * Every callable's first line: signed in, App Check (when enforced), app build not below its
 * channel's minimum (force update), per-user rate limit.
 * @returns the caller's uid
 */
export async function requireCaller(request: CallableRequest, fn: Callable): Promise<string> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }
  checkAppCheck(request);
  await checkAppVersion(request);
  checkRate(fn, request.auth.uid);
  return request.auth.uid;
}

/**
 * requireCaller for callables logged-out visitors may use: signed-in callers are limited per
 * uid, guests per IP (same limit, separate keys)
 * @returns the caller's uid, or null for a guest
 */
export async function requireCallerOrGuest(
  request: CallableRequest,
  fn: Callable,
): Promise<string | null> {
  checkAppCheck(request);
  await checkAppVersion(request);
  const uid = request.auth?.uid ?? null;
  checkRate(fn, uid ?? `ip:${callerIp(request)}`);
  return uid;
}
