import { HistoryFilter, HistorySort, WatchStatus } from "../enums";

export const HISTORY_SORTS: HistorySort[] = [HistorySort.LAST_WATCHED, HistorySort.TIME_SPENT];

export const HISTORY_SORT_LABEL: Record<HistorySort, string> = {
	[HistorySort.LAST_WATCHED]: "Last watched",
	[HistorySort.TIME_SPENT]: "Total time spent",
};

export const HISTORY_FILTERS: HistoryFilter[] = [HistoryFilter.PAUSED, HistoryFilter.WATCHING, HistoryFilter.REWATCHING];

export const HISTORY_FILTER_LABEL: Record<HistoryFilter, string> = {
	[HistoryFilter.PAUSED]: "Paused",
	[HistoryFilter.WATCHING]: "Currently watching",
	[HistoryFilter.REWATCHING]: "Rewatching",
};

const FILTER_STATUSES: Record<HistoryFilter, WatchStatus[]> = {
	[HistoryFilter.PAUSED]: [WatchStatus.PAUSED, WatchStatus.PAUSED_REWATCH],
	[HistoryFilter.WATCHING]: [WatchStatus.WATCHING, WatchStatus.PLAN_TO_WATCH],
	[HistoryFilter.REWATCHING]: [WatchStatus.REWATCHING],
};

/** Tracking statuses a filter set matches (empty = no status filter) — for a Firestore `in` */
export function historyFilterStatuses(filters: ReadonlySet<HistoryFilter>): WatchStatus[] {
	return HISTORY_FILTERS.filter((f) => filters.has(f)).flatMap((f) => FILTER_STATUSES[f]);
}

/** Default view (newest watch first, no filters) uses the cached, delta-synced list */
export function isDefaultHistoryView(sort: HistorySort, filters: ReadonlySet<HistoryFilter>): boolean {
	return sort === HistorySort.LAST_WATCHED && filters.size === 0;
}
