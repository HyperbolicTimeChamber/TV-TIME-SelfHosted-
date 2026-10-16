import { HistoryFilter, HistoryPill, HistoryProgress, HistorySort, WatchStatus } from "../enums";
import type { HistoryCard } from "./historyCard";

const STATUS_FILTERS = [HistoryFilter.PAUSED, HistoryFilter.WATCHING, HistoryFilter.REWATCHING];
const AIR_FILTERS = [HistoryFilter.ENDED, HistoryFilter.AIRING];

/** Sort options per tab (progress only means something for TV) */
export function historySortOptions(isMovie: boolean): HistorySort[] {
	return [
		HistorySort.LAST_WATCHED,
		HistorySort.TITLE,
		HistorySort.RELEASED,
		...(isMovie ? [] : [HistorySort.PROGRESS]),
		HistorySort.TIME_SPENT,
	];
}

export const HISTORY_SORT_LABEL: Record<HistorySort, string> = {
	[HistorySort.LAST_WATCHED]: "Last watched",
	[HistorySort.TITLE]: "Alphabetical",
	[HistorySort.RELEASED]: "Release / premiere date",
	[HistorySort.PROGRESS]: "Progress",
	[HistorySort.TIME_SPENT]: "Total time spent",
};

export const HISTORY_FILTERS: HistoryFilter[] = [...STATUS_FILTERS, ...AIR_FILTERS];

export const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
	[HistoryFilter.PAUSED]: "Paused",
	[HistoryFilter.WATCHING]: "Currently watching",
	[HistoryFilter.REWATCHING]: "Rewatching",
	[HistoryFilter.ENDED]: "Ended",
	[HistoryFilter.AIRING]: "Airing",
};

/** Default view (newest watch first, no filters) pages from the server; anything else needs the whole tab */
export function needsFullHistory(sort: HistorySort, filters: ReadonlySet<HistoryFilter>): boolean {
	return sort !== HistorySort.LAST_WATCHED || filters.size > 0;
}

function matchesStatus(card: HistoryCard, f: HistoryFilter): boolean {
	switch (f) {
		case HistoryFilter.PAUSED:
			return (
				card.progress?.kind === HistoryProgress.PAUSED ||
				card.sortKeys.status === WatchStatus.PAUSED ||
				card.sortKeys.status === WatchStatus.PAUSED_REWATCH
			);
		case HistoryFilter.WATCHING:
			return card.pill === HistoryPill.WATCHING;
		case HistoryFilter.REWATCHING:
			return card.pill === HistoryPill.REWATCHING;
		case HistoryFilter.ENDED:
			return card.sortKeys.airing === false;
		case HistoryFilter.AIRING:
			return card.sortKeys.airing === true;
	}
}

const byLatest = (a: HistoryCard, b: HistoryCard) => b.sortKeys.watchedAt - a.sortKeys.watchedAt;

/** Highest first; unknown (null) values go last */
const desc = (a: number | string | null, b: number | string | null) => {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? 1 : -1;
};

/** Filtered + sorted cards (ties fall back to the latest watch) */
export function applyHistoryView(
	cards: HistoryCard[],
	sort: HistorySort,
	filters: ReadonlySet<HistoryFilter>,
): HistoryCard[] {
	const statuses = STATUS_FILTERS.filter((f) => filters.has(f));
	const airs = AIR_FILTERS.filter((f) => filters.has(f));
	const kept = cards.filter(
		(c) =>
			(statuses.length === 0 || statuses.some((f) => matchesStatus(c, f))) &&
			(airs.length === 0 || airs.some((f) => matchesStatus(c, f))),
	);
	const compare: Record<HistorySort, (a: HistoryCard, b: HistoryCard) => number> = {
		[HistorySort.LAST_WATCHED]: byLatest,
		[HistorySort.TITLE]: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
		[HistorySort.RELEASED]: (a, b) => desc(a.sortKeys.released, b.sortKeys.released),
		[HistorySort.PROGRESS]: (a, b) => desc(a.sortKeys.percent, b.sortKeys.percent),
		[HistorySort.TIME_SPENT]: (a, b) => b.sortKeys.minutes - a.sortKeys.minutes,
	};
	return [...kept].sort((a, b) => compare[sort](a, b) || byLatest(a, b));
}
