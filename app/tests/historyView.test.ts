import { test } from "node:test";
import assert from "node:assert/strict";
import { historyFilterStatuses, isDefaultHistoryView, latestEntries } from "../src/utils/historyView";
import { HistoryFilter, HistorySort, MediaType, WatchStatus } from "../src/enums";

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

test("latestEntries merges the TV and movie histories, most recently watched first, capped", () => {
	const entry = (id: string, historyAt: number) => ({
		id,
		tmdbId: 1,
		mediaType: id.startsWith("tv") ? MediaType.TV : MediaType.MOVIE,
		status: WatchStatus.WATCHING,
		nextEpisode: null,
		rewatchCount: 0,
		historyAt,
		historyUpdatedAt: historyAt,
		minutesWatched: 0,
		plays: 0,
		lastEpisode: null,
	});
	const tv = [entry("tv_a", 9), entry("tv_b", 4)];
	const movies = [entry("movie_c", 7), entry("movie_d", 1)];
	assert.deepEqual(
		latestEntries([tv, movies], 3).map((e) => e.id),
		["tv_a", "movie_c", "tv_b"],
	);
});
