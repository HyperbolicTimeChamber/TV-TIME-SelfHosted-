import { MediaType } from "../enums";
import type { CarouselEpisode, CatalogShow } from "../types";

interface DayItem {
	tmdbShowId: number;
	/** Missing on older upcoming docs → TV */
	mediaType?: MediaType;
	season: number;
	episode: number;
	/** Exact UTC air time when known (TVMaze) */
	airStamp?: string;
}

/** One calendar card: a single episode/movie, or a show's several episodes airing that day */
export interface CalendarGroup<T extends DayItem> {
	key: string;
	first: T;
	episodes: T[];
}

/**
 * Collapse a day's list so each show gets one card, episodes sorted. Cards run in air-time
 * order (a group by its first episode's time); cards without a known time follow, in their
 * original order.
 */
export function groupCalendarDay<T extends DayItem>(items: T[]): CalendarGroup<T>[] {
	const groups = new Map<string, CalendarGroup<T>>();
	for (const item of items) {
		const key = `${item.mediaType ?? MediaType.TV}_${item.tmdbShowId}`;
		const group = groups.get(key);
		if (group) group.episodes.push(item);
		else groups.set(key, { key, first: item, episodes: [item] });
	}
	for (const group of groups.values()) {
		group.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
		group.first = group.episodes[0];
	}
	const time = (g: CalendarGroup<T>) => (g.first.airStamp ? Date.parse(g.first.airStamp) : NaN);
	// Stable sort: timed cards by time, untimed after them
	return [...groups.values()].sort((a, b) => {
		const ta = time(a);
		const tb = time(b);
		if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1;
		if (Number.isNaN(tb)) return -1;
		return ta - tb;
	});
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Collapsed card subtitle: "13 Episodes" */
export function episodeCountLabel(episodes: DayItem[]) {
	return `${episodes.length} Episodes`;
}

/** Flat calendar list row: a card (single or collapsed show), or an episode under an open group */
export enum CalendarRowKind {
	CARD = "card",
	CHILD = "child",
}

/** Collapsed card subtitle: "Season 01", or "Season 01–02" when the day spans seasons */
export function seasonRangeLabel(episodes: DayItem[]) {
	const a = episodes[0].season;
	const b = episodes[episodes.length - 1].season;
	return a === b ? `Season ${pad2(a)}` : `Season ${pad2(a)}–${pad2(b)}`;
}

interface InfoSource {
	season: number;
	episode: number;
	episodeTitle: string;
	airDate: string;
	runtime: number | null;
}

/** One-card episode info for the Calendar: catalog details (still, overview) when cached */
export function calendarEpisodeInfo(
	ep: InfoSource,
	catalog: Pick<CatalogShow, "seasons"> | null | undefined,
): CarouselEpisode {
	const c = catalog?.seasons
		?.find((s) => s.seasonNumber === ep.season)
		?.episodes?.find((e) => e.episodeNumber === ep.episode);
	return {
		season: ep.season,
		episode: ep.episode,
		title: c?.title || ep.episodeTitle || null,
		airDate: c?.airDate ?? ep.airDate,
		runtime: c?.runtime ?? ep.runtime,
		stillPath: c?.stillPath ?? null,
		overview: c?.overview || null,
	};
}

/** One event marker in a calendar cell (bar in month view, titled chip in full view) */
export interface DayMark {
	key: string;
	title: string;
	mediaType: MediaType;
}

/** date → its cards' markers (one per show/movie, air-time order, same grouping as the list) */
export function buildDayMarks<T extends DayItem & { airDate: string; showTitle: string }>(
	items: T[],
): Map<string, DayMark[]> {
	const byDate = new Map<string, T[]>();
	for (const item of items) {
		const list = byDate.get(item.airDate);
		if (list) list.push(item);
		else byDate.set(item.airDate, [item]);
	}
	const marks = new Map<string, DayMark[]>();
	for (const [date, list] of byDate) {
		marks.set(
			date,
			groupCalendarDay(list).map((g) => ({
				key: g.key,
				title: g.first.showTitle,
				mediaType: g.first.mediaType ?? MediaType.TV,
			})),
		);
	}
	return marks;
}
