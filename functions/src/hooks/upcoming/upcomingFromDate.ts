const DAY_MS = 86_400_000;

/**
 * First air date kept in a user's `upcoming` list: yesterday in UTC. Catalog air dates are the
 * show's local (US) date, so after 00:00 UTC an episode airing that US evening (SNL: Saturday
 * 23:30 ET = Sunday 04:30 UTC) looks past against the UTC date. The client reads from yesterday
 * too and filters on the viewer's local day, so the extra day never shows as upcoming.
 */
export function upcomingFromDate(now: Date = new Date()): string {
  return new Date(now.getTime() - DAY_MS).toISOString().slice(0, 10);
}
