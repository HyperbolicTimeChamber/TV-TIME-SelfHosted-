import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHistoryView, needsFullHistory } from "../src/utils/historyView";
import { HistoryFilter, HistoryPill, HistoryProgress, HistorySort, MediaType, WatchStatus } from "../src/enums";
import type { HistoryCard } from "../src/utils/historyCard";

const card = (
	title: string,
	k: Partial<HistoryCard["sortKeys"]>,
	extra: Partial<HistoryCard> = {},
): HistoryCard => ({
	id: title,
	tmdbId: 1,
	mediaType: MediaType.TV,
	title,
	logoPath: null,
	backdropPath: null,
	pill: HistoryPill.WATCHING,
	pillLabel: null,
	pillCount: null,
	timeSpent: null,
	lastWatched: null,
	watchCount: null,
	progress: null,
	tag: null,
	sortKeys: { watchedAt: 0, minutes: 0, released: null, percent: null, airing: null, status: WatchStatus.WATCHING, ...k },
	...extra,
});

const a = card("alpha", { watchedAt: 3, minutes: 10, released: "2020-01-01", percent: 50, airing: true });
const b = card("Bravo", { watchedAt: 2, minutes: 90, released: "2024-01-01", percent: 100, airing: false }, { pill: HistoryPill.COMPLETED });
const c = card("charlie", { watchedAt: 1, minutes: 30, released: null, percent: 10, airing: true, status: WatchStatus.PAUSED }, { pill: null, progress: { kind: HistoryProgress.PAUSED } });
const d = card("delta", { watchedAt: 4, minutes: 5, released: "2022-01-01", percent: 80, airing: false }, { pill: HistoryPill.REWATCHING });
const none = new Set<HistoryFilter>();
const titles = (cs: HistoryCard[]) => cs.map((x) => x.title);

test("applyHistoryView: sorts (unknown values last, ties → latest watch)", () => {
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.LAST_WATCHED, none)), ["delta", "alpha", "Bravo", "charlie"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TITLE, none)), ["alpha", "Bravo", "charlie", "delta"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.RELEASED, none)), ["Bravo", "delta", "alpha", "charlie"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.PROGRESS, none)), ["Bravo", "delta", "alpha", "charlie"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TIME_SPENT, none)), ["Bravo", "charlie", "alpha", "delta"]);
});

test("applyHistoryView: statuses OR, airing OR, groups AND", () => {
	const f = (...xs: HistoryFilter[]) => new Set(xs);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TITLE, f(HistoryFilter.PAUSED))), ["charlie"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TITLE, f(HistoryFilter.WATCHING, HistoryFilter.REWATCHING))), ["alpha", "delta"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TITLE, f(HistoryFilter.ENDED))), ["Bravo", "delta"]);
	assert.deepEqual(titles(applyHistoryView([a, b, c, d], HistorySort.TITLE, f(HistoryFilter.WATCHING, HistoryFilter.AIRING))), ["alpha"]);
	assert.equal(needsFullHistory(HistorySort.LAST_WATCHED, none), false);
	assert.equal(needsFullHistory(HistorySort.TITLE, none), true);
	assert.equal(needsFullHistory(HistorySort.LAST_WATCHED, f(HistoryFilter.ENDED)), true);
});
