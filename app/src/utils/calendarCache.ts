/**
 * A persisted calendar month list is stale once the backend has synced the catalog after it was
 * built. A cache with no recorded sync (saved before the config read came back) counts as stale
 * too — otherwise it could never be invalidated.
 */
export function isCalendarCacheStale(
	cacheSync: string | null | undefined,
	serverSync: string | null | undefined,
): boolean {
	return !!serverSync && cacheSync !== serverSync;
}
