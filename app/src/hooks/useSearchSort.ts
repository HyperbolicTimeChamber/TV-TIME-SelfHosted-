import { useCallback, useState } from "react";
import { DEFAULT_SEARCH_SORT, type SearchSortView } from "../utils/searchSort";

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
