import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, CustomListView } from "../enums";

/** A list page's Grid / List choice — remembered across lists and visits */
export function useCustomListView(): [CustomListView, (view: CustomListView) => void] {
	const [view, setView] = useState<CustomListView>(CustomListView.GRID);

	useEffect(() => {
		let cancelled = false;
		AsyncStorage.getItem(CacheKey.CUSTOM_LIST_VIEW)
			.then((saved) => {
				if (!cancelled && (saved === CustomListView.GRID || saved === CustomListView.LIST)) {
					setView(saved);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const update = useCallback((next: CustomListView) => {
		setView(next);
		AsyncStorage.setItem(CacheKey.CUSTOM_LIST_VIEW, next).catch(() => {});
	}, []);

	return [view, update];
}
