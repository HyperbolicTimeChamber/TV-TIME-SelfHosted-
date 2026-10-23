import { MediaType } from "../enums";
import { fetchCatalogShows } from "../services/historyApi";
import { showDocId } from "../utils";
import { cacheCatalogShows, getCachedCatalogShow, whenCatalogRestored } from "./useWatchlist";

// Asked once per session — a catalog doc that doesn't exist isn't re-read on every render
const requested = new Set<string>();
// Requests that came back (found, missing or failed) — nothing more is coming for these
const settled = new Set<string>();

/** This title's catalog fetch has finished this session (whatever it found) */
export function catalogSettled(tmdbId: number, mediaType: MediaType): boolean {
	return settled.has(showDocId(tmdbId, mediaType));
}

/**
 * Catalogs not in the shared cache, or cached before logos existed (no `logoPath`
 * field), are fetched in one batched query and cached. Resolves true when anything
 * was fetched, so the caller can re-render. Used by Watch History and the calendar.
 */
export async function ensureFreshCatalogs(
	items: Array<{ tmdbId: number; mediaType: MediaType }>,
): Promise<boolean> {
	// The persisted cache may still be restoring — don't re-fetch what it already holds
	await whenCatalogRestored();
	const ids = [
		...new Set(
			items
				.filter((i) => {
					const c = getCachedCatalogShow(i.tmdbId, i.mediaType);
					return !c || !("logoPath" in c);
				})
				.map((i) => showDocId(i.tmdbId, i.mediaType)),
		),
	].filter((id) => !requested.has(id));
	if (ids.length === 0) return false;
	ids.forEach((id) => requested.add(id));
	try {
		cacheCatalogShows(await fetchCatalogShows(ids));
	} finally {
		ids.forEach((id) => settled.add(id));
	}
	return true;
}
