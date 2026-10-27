import { WatchStatus, MediaType } from "../types";
import { EnrichedTrackingItem } from "./useWatchlist";
import { todayStr } from "../utils";
import { hasAired, nextEpisodeAirStamp } from "../utils/airTime";

/**
 * Whether an item belongs in the watchlist. TV uses the tracking doc's nextEpisode
 * (not watched-episode counts): visible only once that episode has aired. Movies need
 * a known, past release date. Statuses other than watching / rewatching / plan to watch
 * are always hidden.
 */
export function isShowVisible(item: EnrichedTrackingItem): boolean {
	const activeStatuses: WatchStatus[] = [
		WatchStatus.WATCHING,
		WatchStatus.REWATCHING,
		WatchStatus.PLAN_TO_WATCH,
	];
	if (!activeStatuses.includes(item.status)) return false;

	const today = todayStr();

	// plan_to_watch — visible unless movie without release date or unreleased
	if (item.status === WatchStatus.PLAN_TO_WATCH) {
		if (item.mediaType === MediaType.MOVIE) {
			const rd = item.releaseDate ?? item.catalogShow?.releaseDate;
			if (!rd) return false; // No release date → hide
			if (rd > today) return false; // Unreleased → hide
		}
		return true;
	}

	// Movies — visible only if released with a known date
	if (item.mediaType === MediaType.MOVIE) {
		const rd = item.releaseDate ?? item.catalogShow?.releaseDate;
		if (!rd) return false; // No release date → hide from watchlist
		if (rd > today) return false; // Unreleased → hide
		return true;
	}

	// No nextEpisode means fully caught up or completed
	const nextEp = item.nextEpisode;
	if (!nextEp) return false;

	// Exact air time (catalog, TVMaze) when known — only once that moment has passed;
	// else the local nextEpisodeAirDate day from the tracking doc (no catalog dependency)
	const airStamp = nextEpisodeAirStamp(nextEp, item.catalogShow);
	const airDate = item.nextEpisodeAirDate;
	if (airStamp || airDate) return hasAired(airStamp, airDate, today);

	// Fallback to catalog if nextEpisodeAirDate not yet populated
	const catalog = item.catalogShow;
	// No air date + no catalog → can't prove it has aired (e.g. unreleased show just added).
	// Hide until catalog/heal arrives; visibility re-evaluates then.
	if (!catalog) return false;

	const season = catalog.seasons?.find((s) => s.seasonNumber === nextEp.season);
	if (!season) return false;

	const episode = season.episodes?.find((e) => e.episodeNumber === nextEp.episode);
	if (!episode?.airDate) return false;
	return episode.airDate <= today;
}

/**
 * Air date (YYYY-MM-DD) of the next episode: the tracking doc's field, else the catalog.
 */
function getNextEpisodeAirDate(item: EnrichedTrackingItem): string | null {
	if (item.nextEpisodeAirDate) return item.nextEpisodeAirDate;
	if (!item.nextEpisode || !item.catalogShow) return null;
	const season = item.catalogShow.seasons?.find((s) => s.seasonNumber === item.nextEpisode!.season);
	if (!season) return null;
	const episode = season.episodes?.find((e) => e.episodeNumber === item.nextEpisode!.episode);
	return episode?.airDate ?? null;
}

/** Sort timestamp: max(priorityDate, next episode air date or movie release date) */
function getEffectivePriority(item: EnrichedTrackingItem): number {
	const priorityMs = item.priorityDate?.toMillis?.() ?? 0;

	let contentDateMs = 0;
	if (item.catalogShow?.mediaType === MediaType.MOVIE) {
		const rd = item.catalogShow.releaseDate;
		if (rd) contentDateMs = new Date(rd).getTime();
	} else {
		const airDate = getNextEpisodeAirDate(item);
		if (airDate) contentDateMs = new Date(airDate).getTime();
	}

	return Math.max(priorityMs, contentDateMs);
}

/** Sort by effective priority, descending */
export function sortByPriority(items: EnrichedTrackingItem[]): EnrichedTrackingItem[] {
	return [...items].sort((a, b) => {
		return getEffectivePriority(b) - getEffectivePriority(a);
	});
}
