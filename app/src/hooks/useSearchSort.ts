import { useCallback, useMemo, useRef, useState } from "react";
import {
	DEFAULT_SEARCH_SORT,
	extendSortedResults,
	type SearchSortView,
} from "../utils/searchSort";
import type { TMDBShow } from "../types/tmdb";

// Session memory: every search screen (trending, each submitted query) shares the last choice
let sessionSort: SearchSortView = DEFAULT_SEARCH_SORT;

/** Search results sort — kept for the app session (not saved across launches) */
export function useSearchSort(): [SearchSortView, (view: SearchSortView) => void] {
	const [view, setView] = useState(sessionSort);
	const choose = useCallback((next: SearchSortView) => {
		sessionSort = next;
		setView(next);
	}, []);
	return [view, choose];
}

/**
 * Loaded search results in `view` order. A page loaded while scrolling is sorted and appended
 * rather than merged in, so cards already on screen never move; a new sort or `stream` (query +
 * filter) sorts everything afresh.
 */
export function useSortedSearchResults<T extends TMDBShow>(
	results: readonly T[] | undefined,
	view: SearchSortView,
	stream: string,
): T[] | undefined {
	const last = useRef<{ view: SearchSortView; stream: string; sorted: T[] } | null>(null);
	return useMemo(() => {
		if (!results) return undefined;
		const prev = last.current;
		const sorted = extendSortedResults(
			prev?.view === view && prev.stream === stream ? prev.sorted : null,
			results,
			view,
		);
		last.current = { view, stream, sorted };
		return sorted;
	}, [results, view, stream]);
}
