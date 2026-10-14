import { MediaType } from "../enums";
import { fetchCatalogShows } from "../services/historyApi";
import { showDocId } from "../utils";
import { cacheCatalogShows, getCachedCatalogShow } from "./useWatchlist";

// Asked once per session — a catalog doc that doesn't exist isn't re-read on every render
const requested = new Set<string>();

/**
 * Catalogs not in the shared cache, or cached before logos existed (no `logoPath`
 * field), are fetched in one batched query and cached. Resolves true when anything
 * was fetched, so the caller can re-render. Used by Watch History and the calendar.
 */
export async function ensureFreshCatalogs(
	items: Array<{ tmdbId: number; mediaType: MediaType }>,
): Promise<boolean> {
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
	cacheCatalogShows(await fetchCatalogShows(ids));
	return true;
}
