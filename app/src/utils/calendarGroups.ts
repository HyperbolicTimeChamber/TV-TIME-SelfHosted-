import { MediaType } from "../enums";

interface DayItem {
	tmdbShowId: number;
	/** Missing on older upcoming docs → TV */
	mediaType?: MediaType;
	season: number;
	episode: number;
}

/** One calendar card: a single episode/movie, or a show's several episodes airing that day */
export interface CalendarGroup<T extends DayItem> {
	key: string;
	first: T;
	episodes: T[];
}

/** Collapse a day's list so each show gets one card; keeps first-seen order, episodes sorted */
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
	return [...groups.values()];
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
