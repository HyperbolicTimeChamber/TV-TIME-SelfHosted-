import { test } from "node:test";
import assert from "node:assert/strict";
import { accountExportFileName, parseAccountExport } from "../src/utils/accountExport";
import { ACCOUNT_EXPORT_FORMAT, MediaType, WatchStatus } from "../src/enums";

const base = {
	format: ACCOUNT_EXPORT_FORMAT,
	version: 1,
	exportedAt: "2026-11-02T10:00:00.000Z",
	tracking: [
		{
			id: "tv_1396",
			status: "rewatching",
			rewatchCount: 2,
			nextEpisode: { season: 1, episode: 3 },
		},
		{ id: "tv_66732", status: "completed", nextEpisode: null },
		{ id: "movie_603", status: "plan_to_watch" },
		{ id: "bogus", status: "watching" },
	],
	watchedEpisodes: {
		"1396": [
			{ season: 1, episode: 1, watchCount: 3, watchedAt: "2026-10-01T10:00:00.000Z" },
			{ season: 1, episode: 2, lastWatchedAt: "2026-10-02T10:00:00.000Z" },
			{ season: "x", episode: 1 },
		],
	},
	watchedMovies: [{ id: "27205", tmdbId: 27205, runtime: 148, watchCount: 2, lastWatchedAt: "2026-10-05T10:00:00.000Z" }],
	customLists: [
		{ id: "b", name: "Second", order: 2, items: [{ tmdbId: 1, mediaType: "tv", title: "A", posterPath: "/a.jpg" }] },
		{ id: "a", name: "First", order: 1, items: [{ tmdbId: 0, mediaType: "tv" }, { tmdbId: 2, mediaType: "movie", title: "B" }] },
	],
};

test("file name carries the date", () => {
	assert.equal(accountExportFileName(Date.UTC(2026, 10, 2)), "watchloom-account-2026-11-02.json");
});

test("restores tracking, rewatch state, episodes and movies", () => {
	const r = parseAccountExport(JSON.stringify(base));
	assert.ok(r.ok);
	const bb = r.matches.find((m) => m.tmdbId === 1396)!;
	assert.equal(bb.status, WatchStatus.REWATCHING);
	assert.equal(bb.rewatchCount, 2);
	assert.deepEqual(bb.nextEpisode, { season: 1, episode: 3 });
	assert.equal(bb.watchedEpisodes!.length, 2);
	assert.equal(bb.watchedEpisodes![0].watchCount, 3);
	assert.equal(bb.watchedEpisodes![1].watchedAt, "2026-10-02T10:00:00.000Z");
	// caught up stays caught up (null), not re-derived
	assert.equal(r.matches.find((m) => m.tmdbId === 66732)!.nextEpisode, null);
	// planned movie keeps its status; a watched movie without tracking comes back completed
	assert.equal(r.matches.find((m) => m.tmdbId === 603)!.status, WatchStatus.PLAN_TO_WATCH);
	const inception = r.matches.find((m) => m.tmdbId === 27205)!;
	assert.equal(inception.mediaType, MediaType.MOVIE);
	assert.equal(inception.status, WatchStatus.COMPLETED);
	assert.equal(inception.movieWatchCount, 2);
	assert.equal(r.matches.length, 4);
});

test("lists come back in order, bad items dropped", () => {
	const r = parseAccountExport(JSON.stringify(base));
	assert.ok(r.ok);
	assert.deepEqual(r.lists.map((l) => l.name), ["First", "Second"]);
	assert.equal(r.lists[0].items.length, 1);
	assert.equal(r.lists[0].items[0].tmdbId, 2);
});

test("refuses other files, newer versions and empty exports", () => {
	assert.deepEqual(parseAccountExport("nope"), { ok: false, reason: "invalid" });
	assert.deepEqual(parseAccountExport(JSON.stringify({ format: "other", tracking: [] })), { ok: false, reason: "invalid" });
	assert.deepEqual(parseAccountExport(JSON.stringify({ ...base, version: 99 })), { ok: false, reason: "newer" });
	assert.deepEqual(parseAccountExport(JSON.stringify({ ...base, tracking: [], watchedMovies: [], customLists: [] })), { ok: false, reason: "empty" });
});
