import { describe, expect, it } from "vitest";
import { MediaType, SearchSort, SortDirection } from "@app/enums";
import type { TMDBShow } from "@app/types";
import { DEFAULT_SEARCH_SORT, extendSortedResults } from "@app/utils/searchSort";

const movie = (id: number, release_date: string) =>
	({ id, media_type: MediaType.MOVIE, title: `M${id}`, release_date }) as TMDBShow;

const ids = (items: TMDBShow[]) => items.map((i) => i.id);

describe("extendSortedResults", () => {
	const page1 = [movie(1, "2001-01-01"), movie(2, "2020-01-01"), movie(3, "2010-01-01")];
	const page2 = [movie(4, "2025-01-01"), movie(5, "2005-01-01")];

	it("sorts everything with no previous output", () => {
		expect(ids(extendSortedResults(null, page1, DEFAULT_SEARCH_SORT))).toEqual([2, 3, 1]);
	});

	it("keeps the shown order and appends a new page sorted on its own", () => {
		const shown = extendSortedResults(null, page1, DEFAULT_SEARCH_SORT);
		const next = extendSortedResults(shown, [...page1, ...page2], DEFAULT_SEARCH_SORT);
		// 4 is newer than everything shown, but goes after it rather than above the scroll position
		expect(ids(next)).toEqual([2, 3, 1, 4, 5]);
	});

	it("sorts afresh when the previous output isn't part of the results", () => {
		const shown = extendSortedResults(null, page1, DEFAULT_SEARCH_SORT);
		const other = [movie(6, "1999-01-01"), movie(7, "2030-01-01")];
		expect(ids(extendSortedResults(shown, other, DEFAULT_SEARCH_SORT))).toEqual([7, 6]);
	});

	it("uses the given sort for the appended page", () => {
		const view = { sort: SearchSort.DATE, direction: SortDirection.ASC };
		const shown = extendSortedResults(null, page1, view);
		expect(ids(extendSortedResults(shown, [...page1, ...page2], view))).toEqual([1, 3, 2, 5, 4]);
	});
});
