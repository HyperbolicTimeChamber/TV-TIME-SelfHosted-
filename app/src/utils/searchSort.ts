import { SearchSort, SortDirection } from "../enums";
import type { TMDBShow } from "../types/tmdb";

export interface SearchSortView {
	sort: SearchSort;
	direction: SortDirection;
}

export interface SearchSortOption extends SearchSortView {
	label: string;
}

export const DEFAULT_SEARCH_SORT: SearchSortView = {
	sort: SearchSort.DATE,
	direction: SortDirection.DESC,
};

export const SEARCH_SORT_OPTIONS: SearchSortOption[] = [
	{ sort: SearchSort.DATE, direction: SortDirection.DESC, label: "Newest first" },
	{ sort: SearchSort.DATE, direction: SortDirection.ASC, label: "Oldest first" },
	{ sort: SearchSort.NAME, direction: SortDirection.ASC, label: "A → Z" },
];

export const sameSearchSort = (a: SearchSortView, b: SearchSortView): boolean =>
	a.sort === b.sort && a.direction === b.direction;

// Case- and accent-insensitive dictionary order; numbers by value ("Saw 2" before "Saw 10")
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Movie release_date / TV first_air_date ("YYYY-MM-DD" — compares as a string), "" when unknown */
const releaseOf = (item: TMDBShow): string => item.release_date || item.first_air_date || "";
const titleOf = (item: TMDBShow): string => (item.title || item.name || "").trim();

/** Comparator for a sort view — items missing the key (no date / no title) go last either way */
export function compareSearchResults(view: SearchSortView): (a: TMDBShow, b: TMDBShow) => number {
	const sign = view.direction === SortDirection.ASC ? 1 : -1;
	const key = view.sort === SearchSort.DATE ? releaseOf : titleOf;
	const compare =
		view.sort === SearchSort.DATE
			? (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
			: collator.compare;
	return (a, b) => {
		const ka = key(a);
		const kb = key(b);
		if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
		return sign * compare(ka, kb);
	};
}

/** Sorted copy — stable, so ties keep TMDB's relevance order */
export function sortSearchResults<T extends TMDBShow>(
	items: readonly T[],
	view: SearchSortView,
): T[] {
	return [...items].sort(compareSearchResults(view));
}
