import { test } from "node:test";
import assert from "node:assert/strict";
import {
	accountExportFileName,
	accountExportOptions,
	describeAccountExport,
	describeAccountImport,
	parseAccountExport,
} from "../src/utils/accountExport";
import {
	ACCOUNT_EXPORT_FORMAT,
	ExportContent,
	ExportFilter,
	ExportPart,
	ExportScope,
	MediaType,
	WatchStatus,
} from "../src/enums";

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
	watchedMovies: [
		{
			id: "27205",
			tmdbId: 27205,
			runtime: 148,
			watchCount: 2,
			lastWatchedAt: "2026-10-05T10:00:00.000Z",
		},
	],
	customLists: [
		{
			id: "b",
			name: "Second",
			order: 2,
			items: [{ tmdbId: 1, mediaType: "tv", title: "A", posterPath: "/a.jpg" }],
		},
		{
			id: "a",
			name: "First",
			order: 1,
			items: [
				{ tmdbId: 0, mediaType: "tv" },
				{ tmdbId: 2, mediaType: "movie", title: "B" },
			],
		},
	],
};

test("file name carries the date", () => {
	assert.equal(
		accountExportFileName(Date.UTC(2026, 10, 2, 12)),
		"Watchloom - Full Backup - 2 Nov 2026.json",
	);
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
	assert.deepEqual(
		r.lists.map((l) => l.name),
		["First", "Second"],
	);
	assert.equal(r.lists[0].items.length, 1);
	assert.equal(r.lists[0].items[0].tmdbId, 2);
});

test("refuses other files, newer versions and empty exports", () => {
	assert.deepEqual(parseAccountExport("nope"), { ok: false, reason: "invalid" });
	assert.deepEqual(parseAccountExport(JSON.stringify({ format: "other", tracking: [] })), {
		ok: false,
		reason: "invalid",
	});
	assert.deepEqual(parseAccountExport(JSON.stringify({ ...base, version: 99 })), {
		ok: false,
		reason: "newer",
	});
	assert.deepEqual(
		parseAccountExport(
			JSON.stringify({ ...base, tracking: [], watchedMovies: [], customLists: [] }),
		),
		{ ok: false, reason: "empty" },
	);
});

test("export options: everything, chosen parts, titles only", () => {
	const none = new Set<ExportPart>();
	assert.deepEqual(
		accountExportOptions(ExportScope.ALL, ExportFilter.ALL, ExportContent.EVERYTHING, none).parts,
		Object.values(ExportPart),
	);
	assert.deepEqual(
		accountExportOptions(
			ExportScope.TV,
			ExportFilter.TV_ENDED,
			ExportContent.CHOSEN,
			new Set([ExportPart.LISTS, ExportPart.PROGRESS]),
		),
		// Lists aren't a part to tick: they're their own scope
		{ scope: ExportScope.TV, filter: ExportFilter.TV_ENDED, parts: [ExportPart.PROGRESS] },
	);
	// Narrowed to shows, all the data = progress + history (no lists)
	assert.deepEqual(
		accountExportOptions(ExportScope.TV, ExportFilter.ALL, ExportContent.EVERYTHING, none).parts,
		[ExportPart.PROGRESS, ExportPart.HISTORY],
	);
	assert.deepEqual(
		accountExportOptions(
			ExportScope.MOVIES,
			ExportFilter.MOVIES_UPCOMING,
			ExportContent.TITLES,
			none,
		).parts,
		[],
	);
});

test("export options: a filter from another scope falls back to all", () => {
	const o = accountExportOptions(
		ExportScope.MOVIES,
		ExportFilter.TV_ENDED,
		ExportContent.EVERYTHING,
		new Set(),
	);
	assert.equal(o.filter, ExportFilter.ALL);
	assert.equal(
		accountExportOptions(
			ExportScope.ALL,
			ExportFilter.MOVIES_TO_WATCH,
			ExportContent.EVERYTHING,
			new Set(),
		).filter,
		ExportFilter.ALL,
	);
});

test("file name says what a narrowed export holds", () => {
	const now = Date.UTC(2026, 10, 2, 12);
	const both = [ExportPart.PROGRESS, ExportPart.HISTORY];
	const name = (scope: ExportScope, filter: ExportFilter, parts: ExportPart[]) =>
		accountExportFileName(now, { scope, filter, parts });
	assert.equal(
		name(ExportScope.MOVIES, ExportFilter.MOVIES_TO_WATCH, both),
		"Watchloom - Movies to Watch - 2 Nov 2026.json",
	);
	assert.equal(
		name(ExportScope.TV, ExportFilter.ALL, both),
		"Watchloom - TV Shows - 2 Nov 2026.json",
	);
	assert.equal(
		name(ExportScope.TV, ExportFilter.TV_ENDED, []),
		"Watchloom - Ended Shows (Titles Only) - 2 Nov 2026.json",
	);
	assert.equal(
		name(ExportScope.MOVIES, ExportFilter.MOVIES_UPCOMING, [ExportPart.HISTORY]),
		"Watchloom - Upcoming Movies (Watch History) - 2 Nov 2026.json",
	);
	assert.equal(
		name(ExportScope.ALL, ExportFilter.ALL, [ExportPart.PROGRESS]),
		"Watchloom - All Titles (Progress) - 2 Nov 2026.json",
	);
	assert.equal(
		name(ExportScope.ALL, ExportFilter.ALL, Object.values(ExportPart)),
		"Watchloom - Full Backup - 2 Nov 2026.json",
	);
});

test("v2 titles-only file: titles come back to track, nothing watched", () => {
	const r = parseAccountExport(
		JSON.stringify({
			format: ACCOUNT_EXPORT_FORMAT,
			version: 2,
			exportedAt: "2026-11-06T10:00:00.000Z",
			scope: "all",
			filter: "all",
			parts: [],
			tracking: [
				{
					id: "tv_1396",
					tmdbId: 1396,
					mediaType: "tv",
					title: "Breaking Bad",
					posterPath: "/b.jpg",
				},
				{ id: "movie_603", tmdbId: 603, mediaType: "movie", title: "The Matrix", posterPath: null },
			],
		}),
	);
	assert.ok(r.ok);
	if (!r.ok) return;
	assert.equal(r.matches.length, 2);
	const show = r.matches.find((m) => m.mediaType === MediaType.TV)!;
	assert.equal(show.status, WatchStatus.WATCHING);
	assert.deepEqual(show.watchedEpisodes, []);
	assert.equal(show.nextEpisode, undefined);
	const movie = r.matches.find((m) => m.mediaType === MediaType.MOVIE)!;
	assert.equal(movie.status, WatchStatus.WATCHING);
	assert.equal(r.lists.length, 0);
	assert.equal(r.exportedAt, "2026-11-06T10:00:00.000Z");
});

test("refuses a version newer than this build reads", () => {
	const r = parseAccountExport(JSON.stringify({ ...base, version: 3 }));
	assert.deepEqual(r, { ok: false, reason: "newer" });
});

test("describes an export and an import file", () => {
	assert.equal(
		describeAccountExport({
			scope: ExportScope.MOVIES,
			filter: ExportFilter.MOVIES_TO_WATCH,
			parts: [],
		}),
		"Movies · To be watched · Titles only",
	);
	assert.equal(
		describeAccountExport({
			scope: ExportScope.ALL,
			filter: ExportFilter.ALL,
			parts: Object.values(ExportPart),
		}),
		"Everything · All the data",
	);
	const r = parseAccountExport(JSON.stringify(base));
	assert.ok(r.ok);
	if (r.ok)
		assert.equal(describeAccountImport(r.matches, r.lists), "2 shows, 2 movies and 2 lists");
});

test("custom lists export: the lists alone, whatever the second step says", () => {
	const o = accountExportOptions(
		ExportScope.LISTS,
		ExportFilter.TV_ENDED,
		ExportContent.TITLES,
		new Set(),
	);
	assert.deepEqual(o, {
		scope: ExportScope.LISTS,
		filter: ExportFilter.ALL,
		parts: [ExportPart.LISTS],
	});
	assert.equal(describeAccountExport(o), "Custom lists");
	assert.equal(
		accountExportFileName(Date.UTC(2026, 10, 2, 12), o),
		"Watchloom - Custom Lists - 2 Nov 2026.json",
	);
});

test("lists-only file imports its lists", () => {
	const r = parseAccountExport(
		JSON.stringify({
			format: ACCOUNT_EXPORT_FORMAT,
			version: 2,
			exportedAt: "2026-11-06T10:00:00.000Z",
			scope: "lists",
			parts: ["lists"],
			tracking: [],
			customLists: base.customLists,
		}),
	);
	assert.ok(r.ok);
	if (r.ok) {
		assert.equal(r.matches.length, 0);
		assert.equal(r.lists.length, 2);
	}
});
