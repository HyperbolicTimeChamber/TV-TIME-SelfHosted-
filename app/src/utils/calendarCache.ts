/**
 * A persisted calendar month is stale once the backend has synced the catalog after it was
 * built. A month with no recorded sync (built before the config read came back) counts as stale
 * too — otherwise it could never be invalidated.
 */
export function isCalendarCacheStale(
	cacheSync: string | null | undefined,
	serverSync: string | null | undefined,
): boolean {
	return !!serverSync && cacheSync !== serverSync;
}

interface OwnedCache<T> {
	/** Account the months were built for — a cache from another sign-in is never shown */
	userId?: string;
	months: Record<string, T>;
}

/** The persisted cache if `uid` built it, else an empty one for `uid` (another account's or a
 *  legacy owner-less cache would show shows this account doesn't track) */
export function calendarCacheForUser<C extends OwnedCache<unknown>>(
	cache: C | null | undefined,
	uid: string,
): C | { userId: string; months: {} } {
	return cache?.userId === uid ? cache : { userId: uid, months: {} };
}
