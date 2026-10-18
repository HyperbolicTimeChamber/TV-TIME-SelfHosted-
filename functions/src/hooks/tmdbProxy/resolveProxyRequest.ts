/**
 * Guest (logged-out web) TMDB access. Only read endpoints the search + show
 * info screens need are allowed; everything else is rejected so the proxy
 * can't be used as an open TMDB relay.
 */

interface Route {
  pattern: RegExp;
  /** CDN cache lifetime (seconds) — Firebase Hosting caches by full URL */
  sMaxAge: number;
}

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const ROUTES: Route[] = [
  { pattern: /^\/search\/(multi|tv|movie)$/, sMaxAge: HOUR },
  { pattern: /^\/trending\/(all|tv|movie)\/(day|week)$/, sMaxAge: 6 * HOUR },
  { pattern: /^\/(tv|movie)\/\d+$/, sMaxAge: DAY },
  { pattern: /^\/tv\/\d+\/season\/\d+$/, sMaxAge: DAY },
];

const ALLOWED_PARAMS: Record<string, (v: string) => boolean> = {
  query: (v) => v.length > 0 && v.length <= 100,
  page: (v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 500,
  append_to_response: (v) =>
    v.split(",").every((p) => ["credits", "similar", "images"].includes(p)),
  // Title logos with the details (images): English + language-neutral only
  include_image_language: (v) => v === "en,null",
  language: (v) => /^[a-z]{2}(-[A-Z]{2})?$/.test(v),
};

export const PROXY_PREFIX = "/api/tmdb";

export type ProxyResolution =
  | {
      ok: true;
      tmdbPath: string;
      params: Record<string, string>;
      sMaxAge: number;
    }
  | { ok: false; status: number; error: string };

export function resolveProxyRequest(
  method: string,
  rawPath: string,
  query: Record<string, unknown>,
): ProxyResolution {
  if (method !== "GET")
    return { ok: false, status: 405, error: "Method not allowed" };

  const tmdbPath = rawPath.startsWith(PROXY_PREFIX)
    ? rawPath.slice(PROXY_PREFIX.length)
    : rawPath;
  const route = ROUTES.find((r) => r.pattern.test(tmdbPath));
  if (!route) return { ok: false, status: 404, error: "Unsupported endpoint" };

  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") continue;
    const valid = ALLOWED_PARAMS[key];
    if (!valid) continue; // drop unknown params (incl. any api_key)
    if (!valid(value))
      return { ok: false, status: 400, error: `Invalid ${key}` };
    params[key] = value;
  }
  if (tmdbPath.startsWith("/search/") && !params.query) {
    return { ok: false, status: 400, error: "query required" };
  }
  return { ok: true, tmdbPath, params, sMaxAge: route.sMaxAge };
}
