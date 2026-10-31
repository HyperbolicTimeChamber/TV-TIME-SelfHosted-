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

test("addItemToList puts the newest title first and stamps the list", () => {
	const a = addItemToList(list("a"), entry(1), 100);
	const b = addItemToList(a, entry(2), 200);
	assert.deepEqual(
		b.items.map((i) => i.tmdbId),
		[2, 1],
	);
	assert.equal(b.items[0].addedAt, 200);
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
