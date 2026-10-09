// functions/src/cloudFunctions/tmdbProxy.ts
import { onRequest } from "firebase-functions/v2/https";
import {
  defineBoolean,
  defineInt,
  defineString,
} from "firebase-functions/params";
import { getAppCheck } from "firebase-admin/app-check";
import axios from "axios";
import { getTmdbApiKey, invalidateApiKeyCache } from "../hooks/apiKey";
import {
  resolveProxyRequest,
  RateLimiter,
  RateLimitError,
  isAllowedCaller,
} from "../hooks/tmdbProxy";
import { TMDB_BASE } from "../shared/enums";

// Configured via functions/.env (or deploy-time prompts); defaults keep it safe
const ALLOWED_ORIGINS = defineString("TMDB_PROXY_ALLOWED_ORIGINS", {
  default:
    "https://watchloom-app.web.app,https://watchloom-app.firebaseapp.com,http://localhost:5173",
});
/** true → reject requests without a valid App Check token (turn on once the web app ships App Check) */
const ENFORCE_APP_CHECK = defineBoolean("TMDB_PROXY_ENFORCE_APP_CHECK", {
  default: false,
});
/** Requests/second to TMDB (TMDB allows ~40; keep headroom) */
const RATE_LIMIT = defineInt("TMDB_PROXY_RATE_LIMIT", { default: 35 });

let limiter: RateLimiter | null = null;

/**
 * Read-only TMDB proxy for logged-out web visitors (search + show info).
 * - Served through the Hosting rewrite /api/tmdb/** so the CDN caches responses
 * - Single instance + in-memory limiter = global TMDB rate cap; over-limit
 *   requests queue (up to 5s) instead of failing
 * - Origin filter + App Check token so only the Watchloom web app can use it
 */
export const tmdbProxy = onRequest(
  {
    maxInstances: 1,
    concurrency: 80,
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 20,
  },
  async (req, res) => {
    if (!isAllowedCaller(req.headers, ALLOWED_ORIGINS.value().split(","))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const appCheckToken = req.header("X-Firebase-AppCheck");
    if (appCheckToken) {
      try {
        await getAppCheck().verifyToken(appCheckToken);
      } catch {
        res.status(401).json({ error: "Invalid App Check token" });
        return;
      }
    } else if (ENFORCE_APP_CHECK.value()) {
      res.status(401).json({ error: "App Check token required" });
      return;
    }

    const resolved = resolveProxyRequest(
      req.method,
      req.path,
      req.query as Record<string, unknown>,
    );
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    limiter ??= new RateLimiter(RATE_LIMIT.value());
    try {
      await limiter.acquire();
    } catch (err) {
      if (err instanceof RateLimitError) {
        res.set("Retry-After", String(err.retryAfterSec));
        res.status(503).json({ error: "Busy, retry shortly" });
        return;
      }
      throw err;
    }

    try {
      const apiKey = await getTmdbApiKey();
      const { data } = await axios.get(`${TMDB_BASE}${resolved.tmdbPath}`, {
        params: { ...resolved.params, api_key: apiKey },
        timeout: 10000,
      });
      res.set(
        "Cache-Control",
        `public, max-age=300, s-maxage=${resolved.sMaxAge}`,
      );
      res.status(200).json(data);
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      if (status === 401) invalidateApiKeyCache();
      res.set("Cache-Control", "no-store");
      res
        .status(status === 401 ? 502 : status)
        .json({ error: "TMDB request failed" });
    }
  },
);
