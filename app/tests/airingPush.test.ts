import { test } from "node:test";
import assert from "node:assert/strict";
import { alertTarget, parseAiringPush } from "../src/utils/airingPush";
import { AIRING_MESSAGE, AlertType, MediaType } from "../src/enums";

test("parseAiringPush reads the corrections, skips untimed items", () => {
	const items = JSON.stringify([
		{ season: 2, episode: 3, name: "Pilot", airDate: "2026-11-17", airStamp: "2026-11-18T01:00:00+00:00" },
		{ season: 2, episode: 4, name: "No Time", airDate: "2026-11-18" },
		{ season: "x", episode: 5, name: "Bad", airStamp: "2026-11-18T01:00:00+00:00" },
	]);
	const parsed = parseAiringPush({ type: AIRING_MESSAGE, docId: "tv_1", mediaType: "tv", title: "Scrubs", items, count: "3" });
	assert.deepEqual(parsed, {
		docId: "tv_1",
		overrides: [{ docId: "tv_1", season: 2, episode: 3, name: "Pilot", airStamp: "2026-11-18T01:00:00+00:00" }],
	});
});

test("parseAiringPush ignores other pushes and survives bad JSON", () => {
	assert.equal(parseAiringPush({ type: "app_update" }), null);
	assert.equal(parseAiringPush(undefined), null);
	assert.equal(parseAiringPush({ type: AIRING_MESSAGE }), null);
	assert.deepEqual(parseAiringPush({ type: AIRING_MESSAGE, docId: "tv_1", items: "{" }), { docId: "tv_1", overrides: [] });
	assert.deepEqual(parseAiringPush({ type: AIRING_MESSAGE, docId: "movie_2", items: "[]" }), { docId: "movie_2", overrides: [] });
});

test("alertTarget: a title page for title alerts, Upcoming for grouped ones, null for foreign data", () => {
	assert.deepEqual(alertTarget({ alert: AlertType.EPISODE, tmdbId: 12, mediaType: MediaType.TV }), {
		alert: AlertType.EPISODE,
		show: { tmdbId: 12, mediaType: MediaType.TV },
	});
	assert.deepEqual(alertTarget({ alert: AlertType.MORNING }), { alert: AlertType.MORNING, show: null });
	assert.deepEqual(alertTarget({ alert: AlertType.EPISODE, tmdbId: 0, mediaType: MediaType.TV }), { alert: AlertType.EPISODE, show: null });
	assert.equal(alertTarget({ url: "x" }), null);
	assert.equal(alertTarget(undefined), null);
});
