/**
 * Cheap first filter: only browsers on our own pages. Headers can be forged
 * by scripts, so this is NOT the security boundary — App Check is.
 */
export function isAllowedCaller(
  headers: Record<string, string | string[] | undefined>,
  allowedOrigins: string[],
): boolean {
  const h = (k: string) => {
    const v = headers[k];
    return Array.isArray(v) ? v[0] : v;
  };
  // Same-origin GETs via the Hosting rewrite send no Origin, but do send Sec-Fetch-Site
  if (h("sec-fetch-site") === "same-origin") return true;
  const origin = h("origin") ?? originOf(h("referer"));
  return !!origin && allowedOrigins.includes(origin);
}

function originOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}
