import { ENDED_STATUSES, MediaType } from "../enums";
import type { CatalogShow } from "../types/catalog";
import { isGenericEpisodeTitle } from "./episodeTitle";

/**
 * Catalog data lookup order for tracked shows: local cache → Firestore → TMDB.
 * Exception: search / trending / search results go straight to TMDB (no Firestore).
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

/** One episode of a fresh TMDB season response (only the fields the catalog keeps) */
export interface FreshSeasonEpisode {
	episode_number: number;
	name?: string | null;
	overview?: string | null;
	air_date?: string | null;
	runtime?: number | null;
	still_path?: string | null;
}

/**
 * Patch one season of a cached catalog with fresh TMDB data (episode info modal / show page).
 * TMDB corrects titles after the catalog doc was written and the server sync only catches up a
 * day later — a wrong-but-real title never trips `hasMissingDisplayData`. Blanks and placeholder
 * titles never replace real data; TVMaze-stamped air days stay (more exact than TMDB's US date).
 * Returns null when nothing changed, so callers skip persist / re-render.
 */
export function patchCatalogSeason(
	catalog: CatalogShow,
	seasonNumber: number,
	fresh: FreshSeasonEpisode[],
): CatalogShow | null {
	const season = catalog.seasons?.find((s) => s.seasonNumber === seasonNumber);
	if (!season?.episodes?.length || fresh.length === 0) return null;
	const byNumber = new Map(fresh.map((e) => [e.episode_number, e]));
	let changed = false;
	const episodes = season.episodes.map((ep) => {
		const f = byNumber.get(ep.episodeNumber);
		if (!f) return ep;
		const patch: Partial<typeof ep> = {};
		const title = f.name?.trim();
		const downgrade = isGenericEpisodeTitle(title) && !isGenericEpisodeTitle(ep.title);
		if (title && title !== ep.title && !downgrade) patch.title = title;
		if (f.overview && f.overview !== ep.overview) patch.overview = f.overview;
		if (f.still_path && f.still_path !== ep.stillPath) patch.stillPath = f.still_path;
		if (f.runtime && f.runtime !== ep.runtime) patch.runtime = f.runtime;
		if (!ep.airStamp && f.air_date && f.air_date !== ep.airDate) patch.airDate = f.air_date;
		if (Object.keys(patch).length === 0) return ep;
		changed = true;
		return { ...ep, ...patch };
	});
	if (!changed) return null;
	return {
		...catalog,
		seasons: catalog.seasons.map((s) => (s === season ? { ...s, episodes } : s)),
	};
}

/** Real (non-placeholder) catalog title of the item's next episode, or null */
export function catalogNextEpisodeTitle(
	catalog: Pick<CatalogShow, "seasons"> | null | undefined,
	nextEpisode: { season: number; episode: number } | null | undefined,
): string | null {
	if (!catalog || !nextEpisode) return null;
	const title = catalog.seasons
		?.find((s) => s.seasonNumber === nextEpisode.season)
		?.episodes?.find((e) => e.episodeNumber === nextEpisode.episode)?.title;
	return title && !isGenericEpisodeTitle(title) ? title : null;
}
