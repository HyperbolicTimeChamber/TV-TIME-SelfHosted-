import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineBoolean } from "firebase-functions/params";
import { KeyedRateLimiter } from "./keyedRateLimit";
import { Callable, CALLABLE_RATE_LIMITS } from "../shared/enums";

/**
 * true → callables reject requests without a valid App Check token. Only flip once the app
 * build that ships App Check is what people run (older builds send no token and would break).
 * Can't use onCall's static `enforceAppCheck` for this: it doesn't take a param.
 */
export const ENFORCE_CALLABLE_APP_CHECK = defineBoolean("ENFORCE_CALLABLE_APP_CHECK", {
  default: false,
});

const limiters = new Map<Callable, KeyedRateLimiter>();

/**
 * Every callable's first line: signed in, App Check (when enforced), per-user rate limit.
 * @returns the caller's uid
 */
export function requireCaller(request: CallableRequest, fn: Callable): string {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be signed in");
  }
  // request.app is only set for a verified token (an invalid one is rejected by the SDK)
  if (ENFORCE_CALLABLE_APP_CHECK.value() && !request.app) {
    throw new HttpsError("failed-precondition", "App Check token required");
  }
  let limiter = limiters.get(fn);
  if (!limiter) {
    const { limit, windowMs } = CALLABLE_RATE_LIMITS[fn];
    limiter = new KeyedRateLimiter(limit, windowMs);
    limiters.set(fn, limiter);
  }
  if (!limiter.hit(request.auth.uid)) {
    throw new HttpsError("resource-exhausted", "Too many requests, slow down");
  }
  return request.auth.uid;
}
