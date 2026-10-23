import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_SEARCH_SORT,
	SEARCH_SORT_OPTIONS,
	sameSearchSort,
	sortSearchResults,
} from "../src/utils/searchSort";
import { MediaType, SearchSort, SortDirection } from "../src/enums";
import type { TMDBShow } from "../src/types/tmdb";

const item = (id: number, fields: Partial<TMDBShow>): TMDBShow => ({
	id,
	poster_path: null,
	backdrop_path: null,
	overview: "",
	vote_average: 0,
	genre_ids: [],
	...fields,
});

const results = [
	item(1, { title: "heat", media_type: MediaType.MOVIE, release_date: "1995-12-15" }),
	item(2, { name: "Lost", media_type: MediaType.TV, first_air_date: "2004-09-22" }),
	item(3, { title: "Untitled Project", media_type: MediaType.MOVIE, release_date: "" }),
	item(4, { name: "Émile", media_type: MediaType.TV, first_air_date: "2020-01-01" }),
	item(5, { title: "Alien", media_type: MediaType.MOVIE }),
	item(6, { name: "Arrow", media_type: MediaType.TV, first_air_date: "2012-10-10" }),
];
const ids = (list: TMDBShow[]) => list.map((r) => r.id);
const NEWEST = { sort: SearchSort.DATE, direction: SortDirection.DESC };
const OLDEST = { sort: SearchSort.DATE, direction: SortDirection.ASC };
const NAME = { sort: SearchSort.NAME, direction: SortDirection.ASC };

test("default is release date, newest first", () => {
	assert.ok(sameSearchSort(DEFAULT_SEARCH_SORT, NEWEST));
	assert.ok(sameSearchSort(SEARCH_SORT_OPTIONS[0], DEFAULT_SEARCH_SORT));
});

test("date newest first: TV first_air_date + movie release_date, undated last (relevance order kept)", () => {
	assert.deepEqual(ids(sortSearchResults(results, NEWEST)), [4, 6, 2, 1, 3, 5]);
});

test("date oldest first: undated still last", () => {
	assert.deepEqual(ids(sortSearchResults(results, OLDEST)), [1, 2, 6, 4, 3, 5]);
});

test("name A → Z: case- and accent-insensitive dictionary order", () => {
	assert.deepEqual(ids(sortSearchResults(results, NAME)), [5, 6, 4, 1, 2, 3]);
});

test("sortSearchResults returns a copy", () => {
	const input = [...results];
	sortSearchResults(input, NAME);
	assert.deepEqual(ids(input), ids(results));
});

test("sameSearchSort compares sort + direction", () => {
	assert.equal(sameSearchSort(NEWEST, OLDEST), false);
	assert.equal(sameSearchSort(NAME, { ...NAME }), true);
});
