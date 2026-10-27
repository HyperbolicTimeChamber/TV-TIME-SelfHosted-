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
