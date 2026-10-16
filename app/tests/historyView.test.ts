import { test } from "node:test";
import assert from "node:assert/strict";
import { historyFilterStatuses, isDefaultHistoryView } from "../src/utils/historyView";
import { HistoryFilter, HistorySort, WatchStatus } from "../src/enums";

test("historyFilterStatuses: filters map to tracking statuses (OR)", () => {
	assert.deepEqual(historyFilterStatuses(new Set()), []);
	assert.deepEqual(historyFilterStatuses(new Set([HistoryFilter.PAUSED])), [WatchStatus.PAUSED, WatchStatus.PAUSED_REWATCH]);
	assert.deepEqual(historyFilterStatuses(new Set([HistoryFilter.REWATCHING, HistoryFilter.WATCHING])), [
		WatchStatus.WATCHING,
		WatchStatus.PLAN_TO_WATCH,
		WatchStatus.REWATCHING,
	]);
});

test("isDefaultHistoryView: only last watched with no filters", () => {
	assert.equal(isDefaultHistoryView(HistorySort.LAST_WATCHED, new Set()), true);
	assert.equal(isDefaultHistoryView(HistorySort.TIME_SPENT, new Set()), false);
	assert.equal(isDefaultHistoryView(HistorySort.LAST_WATCHED, new Set([HistoryFilter.PAUSED])), false);
});
