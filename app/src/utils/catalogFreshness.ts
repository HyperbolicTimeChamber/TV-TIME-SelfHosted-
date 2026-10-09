import { ENDED_STATUSES, MediaType } from "../enums";
import type { CatalogShow } from "../types/catalog";
import { isGenericEpisodeTitle } from "./episodeTitle";

/**
 * Catalog data lookup order everywhere: local cache → Firestore → TMDB.
 * These pure helpers decide when a cached entry is too stale/incomplete to use.
 */

interface ItemLike {
	id: string;
	mediaType?: MediaType;
	nextEpisode?: { season: number; episode: number } | null;
	nextEpisodeName?: string | null;
	catalogShow: CatalogShow | null;
}

/** Search stand-in or missing title — real catalog doc should replace it */
export function isIncompleteCatalog(c: CatalogShow): boolean {
	return !!c.partial || !c.title;
}

/** Cached catalog lacks something the UI shows: poster, next-ep title, movie credits */
export function hasMissingDisplayData(item: ItemLike, c: CatalogShow): boolean {
	if (item.mediaType === MediaType.MOVIE) return !c.credits;
	if (!c.posterPath) return true;
	const ne = item.nextEpisode;
	if (!ne) return false;
	const ep = c.seasons
		?.find((s) => s.seasonNumber === ne.season)
		?.episodes?.find((e) => e.episodeNumber === ne.episode);
	return isGenericEpisodeTitle(ep?.title) || isGenericEpisodeTitle(item.nextEpisodeName);
}

/**
 * TMDB heal is the LAST resort: only when there's no usable catalog, or the
 * Firestore copy was already re-read (`backendTried`) and still lacks data.
 */
export function needsTmdbHeal(item: ItemLike, backendTried: boolean): boolean {
	const c = item.catalogShow;
	if (!c || isIncompleteCatalog(c)) return backendTried;
	return backendTried && hasMissingDisplayData(item, c);
}

/**
 * Which tracked shows to re-read from Firestore after a server catalog sync.
 * Cache one sync behind + server change list → only changed shows (usually ~0 reads).
 * Further behind / no stamp / no list → every still-airing TV show once.
 */
export function selectStaleCatalogItems<T extends ItemLike>(
	items: T[],
	stamp: string | null,
	previousCatalogSync: string | null,
	changedShowIds: string[] | null,
): T[] {
	const tv = items.filter((i) => i.mediaType !== MediaType.MOVIE);
	if (stamp && changedShowIds && stamp === previousCatalogSync) {
		const changed = new Set(changedShowIds);
		return tv.filter((i) => changed.has(i.id));
	}
	return tv.filter((i) => !ENDED_STATUSES.includes(i.catalogShow?.status ?? ""));
}
