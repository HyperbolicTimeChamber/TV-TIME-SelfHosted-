import { test } from "node:test";
import assert from "node:assert/strict";
import {
	buildListsExport,
	describeImport,
	listsExportFileName,
	parseListsExport,
	planListsImport,
} from "../src/utils/customListsIO";
import {
	formatRuntime,
	listItemMeta,
	listOrders,
	moveElement,
	sameIdOrder,
	sameItemOrder,
	sortLists,
	titleCount,
} from "../src/utils/customLists";
import { CUSTOM_LIST_MAX, MediaType } from "../src/enums";
import type { CustomList, CustomListItem } from "../src/types/customList";

const item = (tmdbId: number, mediaType = MediaType.TV): CustomListItem => ({
	tmdbId,
	mediaType,
	title: `T${tmdbId}`,
	posterPath: `/p${tmdbId}.jpg`,
	addedAt: 1,
});
const list = (id: string, createdAt: number, items: CustomListItem[] = [], order?: number): CustomList => ({
	id,
	name: id,
	items,
	createdAt,
	updatedAt: createdAt,
	...(order === undefined ? {} : { order }),
});
let n = 0;
const newId = () => `new${++n}`;

test("export lists names, 1-based positions and the title info, in list order", () => {
	const out = buildListsExport(
		[list("B", 200, [item(2, MediaType.MOVIE)]), list("A", 100, [item(1), item(3)])],
		Date.UTC(2026, 10, 2),
	);
	assert.equal(out.format, "watchloom-lists");
	assert.equal(out.version, 1);
	assert.equal(out.exportedAt, "2026-11-02T00:00:00.000Z");
	assert.deepEqual(
		out.lists.map((l) => l.name),
		["A", "B"],
	);
	assert.deepEqual(
		out.lists[0].items.map((i) => [i.position, i.tmdbId, i.title]),
		[
			[1, 1, "T1"],
			[2, 3, "T3"],
		],
	);
	assert.equal(out.lists[1].items[0].mediaType, MediaType.MOVIE);
});

test("export file names: one list is slugged, several are dated", () => {
	assert.equal(listsExportFileName([list("Sci-Fi Night!", 1)], 0), "watchloom-list-sci-fi-night.json");
	assert.equal(listsExportFileName([list("!!!", 1)], 0), "watchloom-list-export.json");
	assert.equal(
		listsExportFileName([list("A", 1), list("B", 2)], Date.UTC(2026, 10, 2)),
		"watchloom-lists-2026-11-02.json",
	);
});

test("an export parses back into the same lists (round trip)", () => {
	const lists = [list("Favorites", 1, [item(5), item(9, MediaType.MOVIE)])];
	const parsed = parseListsExport(JSON.stringify(buildListsExport(lists, 0)));
	assert.ok(parsed.ok);
	assert.equal(parsed.lists[0].name, "Favorites");
	assert.deepEqual(
		parsed.lists[0].items.map((i) => [i.tmdbId, i.mediaType, i.posterPath]),
		[
			[5, MediaType.TV, "/p5.jpg"],
			[9, MediaType.MOVIE, "/p9.jpg"],
		],
	);
});

test("parse reorders by position and drops malformed entries", () => {
	const file = {
		format: "watchloom-lists",
		version: 1,
		lists: [
			{
				name: "  Mix  ",
				items: [
					{ position: 2, tmdbId: 20, mediaType: "tv", title: "Second", posterPath: "/b.jpg" },
					{ position: 1, tmdbId: 10, mediaType: "movie", title: "First", posterPath: "https://evil.example/x" },
					{ position: 3, tmdbId: -4, mediaType: "tv", title: "bad id" },
					{ position: 4, tmdbId: 7, mediaType: "podcast", title: "bad type" },
					"nonsense",
				],
			},
			{ name: "", items: [] },
		],
	};
	const parsed = parseListsExport(JSON.stringify(file));
	assert.ok(parsed.ok);
	assert.equal(parsed.lists.length, 1);
	assert.equal(parsed.lists[0].name, "Mix");
	assert.deepEqual(
		parsed.lists[0].items.map((i) => i.tmdbId),
		[10, 20],
	);
	// A poster path that isn't a plain TMDB path is not kept
	assert.equal(parsed.lists[0].items[0].posterPath, null);
});

test("parse refuses files that aren't ours, are newer, or hold no lists", () => {
	assert.deepEqual(parseListsExport("not json"), { ok: false, reason: "invalid" });
	assert.deepEqual(parseListsExport(JSON.stringify({ format: "other", lists: [] })), {
		ok: false,
		reason: "invalid",
	});
	assert.deepEqual(
		parseListsExport(JSON.stringify({ format: "watchloom-lists", version: 99, lists: [] })),
		{ ok: false, reason: "newer" },
	);
	assert.deepEqual(
		parseListsExport(JSON.stringify({ format: "watchloom-lists", version: 1, lists: [{ name: "X" }] })),
		{ ok: false, reason: "empty" },
	);
});

test("import creates new lists and merges a list with the same name without duplicating titles", () => {
	const existing = [list("Favorites", 1, [item(1)])];
	const imported = [
		{ name: "favorites", items: [item(1), item(2)] },
		{ name: "Horror", items: [item(3), item(4)] },
	];
	const plan = planListsImport(existing, imported, 1000, newId);
	assert.equal(plan.listsCreated, 1);
	assert.equal(plan.listsMerged, 1);
	assert.equal(plan.titlesAdded, 3);
	assert.deepEqual(
		plan.merges[0].items.map((i) => i.tmdbId),
		[1, 2],
	);
	assert.equal(plan.creates[0].name, "Horror");
	assert.deepEqual(
		plan.creates[0].items.map((i) => i.tmdbId),
		[3, 4],
	);
	// Importing the same file again changes nothing
	const again = planListsImport(
		[existing[0], ...plan.creates].map((l) => ({
			...l,
			items: plan.merges.find((m) => m.listId === l.id)?.items ?? l.items,
		})),
		imported,
		2000,
		newId,
	);
	assert.equal(again.titlesAdded, 0);
	assert.equal(again.listsCreated + again.listsMerged, 0);
});

test("import keeps the file's list order via createdAt and stops at the list limit", () => {
	const many = Array.from({ length: 3 }, (_, i) => ({ name: `L${i}`, items: [item(i + 1)] }));
	const plan = planListsImport([], many, 500, newId);
	assert.deepEqual(
		plan.creates.map((l) => l.createdAt),
		[500, 501, 502],
	);
	const full = Array.from({ length: CUSTOM_LIST_MAX }, (_, i) => list(`E${i}`, i));
	const capped = planListsImport(full, [{ name: "Extra", items: [item(1)] }], 1, newId);
	assert.equal(capped.listsSkipped, 1);
	assert.equal(capped.creates.length, 0);
});

test("describeImport summarises the plan in one line", () => {
	const plan = planListsImport([], [{ name: "A", items: [item(1)] }], 1, newId);
	assert.equal(describeImport(plan), "1 new list. 1 title added.");
});

test("moveElement / order helpers", () => {
	assert.deepEqual(moveElement([1, 2, 3, 4], 0, 2), [2, 3, 1, 4]);
	assert.deepEqual(moveElement([1, 2, 3, 4], 3, 0), [4, 1, 2, 3]);
	const same = [1, 2, 3];
	assert.equal(moveElement(same, 1, 1), same);
	assert.equal(moveElement(same, 5, 0), same);
	assert.equal(sameIdOrder([{ id: "a" }, { id: "b" }], [{ id: "a" }, { id: "b" }]), true);
	assert.equal(sameIdOrder([{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }]), false);
	assert.equal(sameItemOrder([item(1), item(2)], [item(1), item(2)]), true);
	assert.equal(sameItemOrder([item(1), item(2)], [item(2), item(1)]), false);
	assert.deepEqual(listOrders([list("x", 9), list("y", 1)]), [
		{ id: "x", order: 0 },
		{ id: "y", order: 1 },
	]);
});

test("sortLists: Favorites' order leads, saved orders next, then unordered lists by age", () => {
	const sorted = sortLists([
		list("old", 100),
		list("new", 300),
		list("fav", 400, [], -1),
		list("second", 200, [], 1),
		list("first", 250, [], 0),
	]);
	assert.deepEqual(
		sorted.map((l) => l.id),
		["fav", "first", "second", "old", "new"],
	);
});

test("list page text helpers", () => {
	assert.equal(titleCount(1), "1 title");
	assert.equal(titleCount(12), "12 titles");
	assert.equal(formatRuntime(45), "45 min");
	assert.equal(formatRuntime(0), null);
	assert.equal(formatRuntime(null), null);
	assert.equal(listItemMeta(MediaType.TV, { totalEpisodes: 62, runtime: 45 }), "62 episodes · 45 min");
	assert.equal(listItemMeta(MediaType.TV, { totalEpisodes: 1, runtime: null }), "1 episode");
	assert.equal(listItemMeta(MediaType.MOVIE, { totalEpisodes: 5, runtime: 136 }), "136 min");
	assert.equal(listItemMeta(MediaType.MOVIE, {}), "");
});
