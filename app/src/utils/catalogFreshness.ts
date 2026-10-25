import {
	ENDED_STATUSES,
	EpisodeType,
	MediaType,
	REFRESH_AIRED_WINDOW_DAYS,
	REFRESH_COOLDOWN_MS,
	RefreshReason,
} from "../enums";
import type { CatalogEpisode, CatalogShow } from "../types/catalog";
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
	episode_type?: EpisodeType | null;
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
		if (f.episode_type && f.episode_type !== ep.episodeType) {
			patch.episodeType = f.episode_type;
			patch.isSeasonFinale = f.episode_type === EpisodeType.FINALE;
		}
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

/**
 * FINALE tag: only TMDB's explicit episode_type. The last listed episode is often just the
 * latest one TMDB knows; docs written before episodeType existed never show the tag.
 */
export function isFinaleEpisode(
	ep: Pick<CatalogEpisode, "episodeType"> | null | undefined,
): boolean {
	return ep?.episodeType === EpisodeType.FINALE;
}

/** Last regular episode the catalog lists (highest season, then episode number) */
export function lastCatalogEpisode(catalog: Pick<CatalogShow, "seasons">): CatalogEpisode | null {
	let last: { season: number; ep: CatalogEpisode } | null = null;
	for (const s of catalog.seasons ?? []) {
		if (s.seasonNumber <= 0) continue;
		for (const ep of s.episodes ?? []) {
			if (
				!last ||
				s.seasonNumber > last.season ||
				(s.seasonNumber === last.season && ep.episodeNumber > last.ep.episodeNumber)
			)
				last = { season: s.seasonNumber, ep };
		}
	}
	return last?.ep ?? null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ask the server (refreshShow) to re-check TMDB: the last episode the catalog lists has aired
 * (today or within the window) and isn't marked a finale — the season likely continues and TMDB
 * may already list the next episodes the weekly sync hasn't picked up. Ended shows, unaired /
 * undated last episodes and docs any user refreshed within the cooldown don't qualify.
 * Pure — 0 reads; `today` is local YYYY-MM-DD, `now` epoch ms.
 */
export function needsServerRefresh(
	catalog: CatalogShow | null | undefined,
	today: string,
	now: number,
): boolean {
	if (!catalog || isIncompleteCatalog(catalog) || catalog.mediaType === MediaType.MOVIE)
		return false;
	if (ENDED_STATUSES.includes(catalog.status)) return false;
	const checkedAt = catalog.lastTmdbCheckAt ?? 0;
	if (now - checkedAt < REFRESH_COOLDOWN_MS[RefreshReason.AIRED_NO_FINALE]) return false;
	const last = lastCatalogEpisode(catalog);
	if (!last?.airDate || last.airDate > today) return false;
	const ageDays = (Date.parse(today) - Date.parse(last.airDate)) / DAY_MS;
	if (!(ageDays <= REFRESH_AIRED_WINDOW_DAYS)) return false;
	return !isFinaleEpisode(last);
}

/** A fresh TMDB season lists episodes the cached catalog doesn't have (or the season itself) */
export function freshSeasonAddsEpisodes(
	catalog: Pick<CatalogShow, "seasons">,
	seasonNumber: number,
	fresh: FreshSeasonEpisode[],
): boolean {
	const season = catalog.seasons?.find((s) => s.seasonNumber === seasonNumber);
	const known = new Set((season?.episodes ?? []).map((e) => e.episodeNumber));
	return fresh.some((e) => !known.has(e.episode_number));
}

/**
 * refreshShow returns the doc whether or not it fetched TMDB — only a doc refreshed after
 * the cached copy replaces it (local season patches would otherwise be rolled back).
 */
export function isNewerServerCatalog(
	server: Pick<CatalogShow, "lastTmdbCheckAt">,
	cached: CatalogShow | null | undefined,
): boolean {
	if (!cached || isIncompleteCatalog(cached)) return true;
	return (server.lastTmdbCheckAt ?? 0) > (cached.lastTmdbCheckAt ?? 0);
}
