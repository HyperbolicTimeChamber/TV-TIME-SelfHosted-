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

/** Local midnight of a `YYYY-MM-DD` day (`new Date(day)` is UTC midnight — ahead of UTC that's
 *  1–14h into the day, so a title released today outranked every mark made before then) */
function localDayStartMs(day: string): number {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return 0;
	return new Date(y, m - 1, d).getTime();
}

/** UTC midnight of a `YYYY-MM-DD` day */
function utcDayStartMs(day: string): number {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return 0;
	return Date.UTC(y, m - 1, d);
}

/**
 * Sort timestamp: max(priorityDate, when the next episode aired / the movie was released). An
 * episode with an exact air time (TVMaze airStamp) counts from that moment — counted from the
 * day's local midnight, an episode out at 13:50 ranked under everything marked that morning and
 * never reached the top. Date-only: local midnight. The content time never counts past now: a
 * date still ahead (catalog and tracking disagreeing on a movie's release) sat above every fresh
 * mark, so each marked card landed under it
 */
export function getEffectivePriority(item: EnrichedTrackingItem, nowMs = Date.now()): number {
	const isMovie = (item.mediaType ?? item.catalogShow?.mediaType) === MediaType.MOVIE;
	// Same release date the visibility check uses
	const contentDay = isMovie
		? (item.releaseDate ?? item.catalogShow?.releaseDate ?? null)
		: getNextEpisodeAirDate(item);
	const airStamp = isMovie ? undefined : nextEpisodeAirStamp(item.nextEpisode, item.catalogShow);
	const airStampMs = airStamp ? Date.parse(airStamp) : NaN;
	const contentStartMs = Number.isFinite(airStampMs)
		? airStampMs
		: contentDay
			? localDayStartMs(contentDay)
			: 0;
	const contentDateMs = contentStartMs ? Math.min(contentStartMs, nowMs) : 0;

	// A priorityDate stamped from the content date (an unaired title's: that day's UTC midnight)
	// is the content date, not a mark — counted at local midnight above. Read as is, east of UTC
	// it was still ahead of now on release day, and every card marked meanwhile landed under it
	const rawPriorityMs = item.priorityDate?.toMillis?.() ?? 0;
	const stampedFromContent = !!contentDay && rawPriorityMs === utcDayStartMs(contentDay);
	const priorityMs = stampedFromContent ? 0 : rawPriorityMs;

	return Math.max(priorityMs, contentDateMs);
}

/** Sort by effective priority, descending */
export function sortByPriority(items: EnrichedTrackingItem[]): EnrichedTrackingItem[] {
	return [...items].sort((a, b) => {
		return getEffectivePriority(b) - getEffectivePriority(a);
	});
}
