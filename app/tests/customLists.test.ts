import { test } from "node:test";
import assert from "node:assert/strict";
import {
	addItemToList,
	cleanListName,
	entryFromSearchResult,
	isListNameTaken,
	listedTitleKeys,
	listIdsContaining,
	removeItemFromList,
	searchMediaType,
	sortLists,
	sheetListOrder,
	listCoverItem,
	profileLists,
} from "../src/utils/customLists";
import { CUSTOM_LIST_ITEM_MAX, CUSTOM_LIST_NAME_MAX, MediaType } from "../src/enums";
import type { CustomList, CustomListEntry } from "../src/types/customList";
import type { TMDBShow } from "../src/types/tmdb";

const list = (id: string, createdAt = 1, items: CustomList["items"] = []): CustomList => ({
	id,
	name: id,
	items,
	createdAt,
	updatedAt: createdAt,
});
const entry = (tmdbId: number, mediaType = MediaType.TV): CustomListEntry => ({
	tmdbId,
	mediaType,
	title: `T${tmdbId}`,
	posterPath: null,
});
const show = (fields: Partial<TMDBShow>): TMDBShow => ({
	id: 1,
	poster_path: null,
	backdrop_path: null,
	overview: "",
	vote_average: 0,
	genre_ids: [],
	...fields,
});

test("addItemToList appends at the end (where the server puts it) and stamps the list", () => {
	const a = addItemToList(list("a"), entry(1), 100);
	const b = addItemToList(a, entry(2), 200);
	assert.deepEqual(
		b.items.map((i) => i.tmdbId),
		[1, 2],
	);
	assert.equal(b.items[1].addedAt, 200);
	assert.equal(b.updatedAt, 200);
});

test("the same tmdbId as a movie and as a show are different titles", () => {
	const a = addItemToList(list("a"), entry(5, MediaType.TV), 1);
	const b = addItemToList(a, entry(5, MediaType.MOVIE), 2);
	assert.equal(b.items.length, 2);
});

test("adding a title already in the list returns the same list", () => {
	const a = addItemToList(list("a"), entry(1), 1);
	assert.equal(addItemToList(a, entry(1), 2), a);
});

test("a full list refuses more titles", () => {
	const items = Array.from({ length: CUSTOM_LIST_ITEM_MAX }, (_, i) => ({
		...entry(i + 1),
		addedAt: 1,
	}));
	const full = list("a", 1, items);
	assert.equal(addItemToList(full, entry(9999), 2), full);
});

test("removeItemFromList drops only that title; a missing one changes nothing", () => {
	const a = addItemToList(addItemToList(list("a"), entry(1), 1), entry(2), 2);
	const b = removeItemFromList(a, 1, MediaType.TV, 3);
	assert.deepEqual(
		b.items.map((i) => i.tmdbId),
		[2],
	);
	assert.equal(b.updatedAt, 3);
	assert.equal(removeItemFromList(b, 1, MediaType.TV, 4), b);
	assert.equal(removeItemFromList(b, 2, MediaType.MOVIE, 4), b);
});

test("cleanListName trims, collapses spaces and caps the length", () => {
	assert.equal(cleanListName("  Sci   Fi \n Night  "), "Sci Fi Night");
	assert.equal(cleanListName("   "), "");
	assert.equal(cleanListName("x".repeat(CUSTOM_LIST_NAME_MAX + 20)).length, CUSTOM_LIST_NAME_MAX);
});

test("isListNameTaken ignores case and the list being renamed", () => {
	const lists = [list("Favourites"), list("Horror")];
	assert.equal(isListNameTaken(lists, "favourites"), true);
	assert.equal(isListNameTaken(lists, "favourites", "Favourites"), false);
	assert.equal(isListNameTaken(lists, "Comedy"), false);
});

test("membership helpers span lists", () => {
	const a = addItemToList(list("a"), entry(1), 1);
	const b = addItemToList(addItemToList(list("b"), entry(1), 1), entry(2, MediaType.MOVIE), 2);
	assert.deepEqual([...listIdsContaining([a, b], 1, MediaType.TV)].sort(), ["a", "b"]);
	assert.deepEqual([...listIdsContaining([a, b], 2, MediaType.MOVIE)], ["b"]);
	assert.deepEqual([...listedTitleKeys([a, b])].sort(), ["movie_2", "tv_1"]);
});

test("searchMediaType / entryFromSearchResult read both result shapes", () => {
	assert.equal(searchMediaType(show({ media_type: MediaType.MOVIE })), MediaType.MOVIE);
	assert.equal(searchMediaType(show({ name: "Lost", first_air_date: "2004-09-22" })), MediaType.TV);
	assert.equal(searchMediaType(show({ title: "Heat" })), MediaType.MOVIE);
	assert.deepEqual(entryFromSearchResult(show({ id: 7, title: "Heat", poster_path: "/p.jpg" })), {
		tmdbId: 7,
		mediaType: MediaType.MOVIE,
		title: "Heat",
		posterPath: "/p.jpg",
	});
});

test("sortLists is oldest first and leaves the input alone", () => {
	const input = [list("b", 2), list("a", 1)];
	assert.deepEqual(
		sortLists(input).map((l) => l.id),
		["a", "b"],
	);
	assert.equal(input[0].id, "b");
});

const touched = (id: string, createdAt: number, updatedAt: number): CustomList => ({
	...list(id, createdAt),
	updatedAt,
});

test("sheetListOrder puts the most recently created or modified list first", () => {
	const lists = [touched("old", 1, 1), touched("edited", 2, 9), touched("new", 5, 5)];
	assert.deepEqual(
		sheetListOrder(lists, null).map((l) => l.id),
		["edited", "new", "old"],
	);
});

test("sheetListOrder keeps the order the sheet opened with; lists made since go on top", () => {
	// "old" was ticked while open (now the most recent) but must not jump under the finger
	const lists = [touched("old", 1, 20), touched("edited", 2, 9), touched("made", 30, 30)];
	assert.deepEqual(
		sheetListOrder(lists, ["edited", "old"]).map((l) => l.id),
		["made", "edited", "old"],
	);
	// Deleted since → just gone
	assert.deepEqual(
		sheetListOrder([touched("old", 1, 1)], ["edited", "old"]).map((l) => l.id),
		["old"],
	);
});

test("sheetListOrder puts the lists already holding the title first, then by recency", () => {
	const entry = { tmdbId: 7, mediaType: MediaType.TV, title: "T", posterPath: null };
	const holding = { ...touched("holding", 1, 1), items: [{ ...entry, addedAt: 1 }] };
	const lists = [holding, touched("recent", 2, 9), touched("older", 3, 5)];
	assert.deepEqual(
		sheetListOrder(lists, null, entry).map((l) => l.id),
		["holding", "recent", "older"],
	);
});

test("listCoverItem is the most recently added title, null for an empty list", () => {
	const item = (tmdbId: number, addedAt: number) => ({
		tmdbId,
		mediaType: MediaType.TV,
		title: String(tmdbId),
		posterPath: null,
		addedAt,
	});
	assert.equal(listCoverItem({ ...list("a"), items: [item(1, 5), item(2, 9), item(3, 2)] })?.tmdbId, 2);
	assert.equal(listCoverItem(list("b")), null);
});

test("profileLists keeps the five biggest lists, biggest first", () => {
	const sized = (id: string, n: number, updatedAt = 1) => ({
		...touched(id, 1, updatedAt),
		items: Array.from({ length: n }, (_, i) => ({
			tmdbId: i,
			mediaType: MediaType.TV,
			title: String(i),
			posterPath: null,
			addedAt: i,
		})),
	});
	const lists = [sized("a", 1), sized("b", 7), sized("c", 3), sized("d", 3, 9), sized("e", 0), sized("f", 2), sized("g", 5)];
	// Ties: the more recently changed first (d over c)
	assert.deepEqual(
		profileLists(lists).map((l) => l.id),
		["b", "g", "d", "c", "f"],
	);
	assert.deepEqual(profileLists([]), []);
	// Empty lists never show on the profile, even with room to spare
	assert.deepEqual(
		profileLists([sized("x", 0), sized("y", 2)]).map((l) => l.id),
		["y"],
	);
});
