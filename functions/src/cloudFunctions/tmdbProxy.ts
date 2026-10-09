// functions/src/cloudFunctions/tmdbProxy.ts
import { onRequest } from "firebase-functions/v2/https";
import axios from "axios";
import { getTmdbApiKey, invalidateApiKeyCache } from "../hooks/apiKey";
import { resolveProxyRequest } from "../hooks/tmdbProxy";
import { TMDB_BASE } from "../shared/enums";

/**
 * Read-only TMDB proxy for logged-out web visitors (search + show info).
 * Served through the Hosting rewrite `/api/tmdb/**` so the CDN caches
 * responses — repeat requests never reach this function.
 */
export const tmdbProxy = onRequest(
  {
    maxInstances: 10,
    timeoutSeconds: 15,
    memory: "256MiB",
  },
  async (req, res) => {
    const resolved = resolveProxyRequest(
      req.method,
      req.path,
      req.query as Record<string, unknown>,
    );
    if (!resolved.ok) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
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
