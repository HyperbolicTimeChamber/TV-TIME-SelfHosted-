import { test } from "node:test";
import assert from "node:assert/strict";

process.env.TZ = "Asia/Kolkata";

import type { AiringOverride, PlanTitle } from "../src/utils/airingPlan";
import { clockLabel, dayLabel, diffTitles, movedEpisodes, parseSeen } from "../src/utils/notifyEvents";
import { AlertType, MediaType, WatchStatus } from "../src/enums";

const at = (date: string, h = 0, m = 0) => {
	const [y, mo, d] = date.split("-").map(Number);
	return new Date(y, mo - 1, d, h, m).getTime();
};

const title = (over: Partial<PlanTitle> = {}): PlanTitle => ({
	docId: "tv_1",
	tmdbId: 1,
	mediaType: MediaType.TV,
	title: "Scrubs",
	status: WatchStatus.WATCHING,
	showStatus: "Returning Series",
	nextEpisode: null,
	releaseDate: null,
	seasons: [{ seasonNumber: 1, episodes: [{ episodeNumber: 1, title: "x", airDate: "2026-11-17", airStamp: new Date(at("2026-11-17", 20)).toISOString() }] }],
	...over,
});

test("diffTitles: the first run and new titles only record", () => {
	const first = diffTitles(null, [title()]);
	assert.deepEqual(first.events, []);
	assert.deepEqual(first.next.tv_1, { status: "Returning Series", seasons: [1] });
	assert.deepEqual(diffTitles({}, [title()]).events, []);
});

test("diffTitles: a show that ends, and a new season with its premiere date", () => {
	const seen = diffTitles(null, [title()]).next;
	const ended = diffTitles(seen, [title({ showStatus: "Ended" })]).events;
	assert.deepEqual(ended.map((e) => [e.type, e.body]), [[AlertType.SERIES_ENDED, "Has ended"]]);
	assert.equal(diffTitles(seen, [title({ showStatus: "Canceled" })]).events[0].body, "Cancelled");
	const s2 = title({
		seasons: [
			...title().seasons,
			{ seasonNumber: 2, episodes: [{ episodeNumber: 1, title: "y", airDate: "2027-01-08" }] },
		],
	});
	const added = diffTitles(seen, [s2]).events;
	assert.deepEqual(added.map((e) => [e.type, e.body, e.key]), [[AlertType.NEW_SEASON, "Season 2 announced · Fri 8 Jan", "tv_1-s2"]]);
	// Unchanged → nothing, and ended stays quiet once seen
	assert.deepEqual(diffTitles(diffTitles(seen, [s2]).next, [s2]).events, []);
});

test("parseSeen: junk is no snapshot", () => {
	assert.equal(parseSeen(null), null);
	assert.equal(parseSeen("nope"), null);
	assert.equal(parseSeen("[1]"), null);
	assert.deepEqual(parseSeen('{"a":{"status":"","seasons":[]}}'), { a: { status: "", seasons: [] } });
});

const override = (h: number, date = "2026-11-17", m = 0): AiringOverride => ({
	docId: "tv_1",
	season: 1,
	episode: 1,
	name: "x",
	airStamp: new Date(at(date, h, m)).toISOString(),
});

test("movedEpisodes: a real move alerts, a small shift or a past time doesn't", () => {
	const now = at("2026-11-16", 12);
	const moved = movedEpisodes([title()], [], [override(21, "2026-11-18")], now);
	assert.equal(moved.length, 1);
	assert.equal(moved[0].type, AlertType.DATE_CHANGED);
	assert.equal(moved[0].body, "S1 E1 moved to Wed 18 Nov, 9:00 pm");
	// 20:00 → 20:10: under half an hour
	assert.deepEqual(movedEpisodes([title()], [], [override(20, "2026-11-17", 10)], now), []);
	// An earlier correction is the baseline
	assert.deepEqual(movedEpisodes([title()], [override(21)], [override(21)], now), []);
	assert.equal(movedEpisodes([title()], [override(21)], [override(22)], now).length, 1);
	// Already past
	assert.deepEqual(movedEpisodes([title()], [], [override(21, "2026-11-15")], now), []);
});

test("labels", () => {
	assert.equal(dayLabel("2026-11-20"), "Fri 20 Nov");
	assert.equal(clockLabel(at("2026-11-20", 0, 5)), "12:05 am");
	assert.equal(clockLabel(at("2026-11-20", 12)), "12:00 pm");
});
