import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CacheKey, CustomListView } from "../enums";

/**
 * A page's Grid / List choice, remembered across visits: a list page's (shared by every list) by
 * default, or another page's under its own key
 */
export function useCustomListView(
	key: CacheKey = CacheKey.CUSTOM_LIST_VIEW,
	initial: CustomListView = CustomListView.GRID,
): [CustomListView, (view: CustomListView) => void] {
	const [view, setView] = useState<CustomListView>(initial);

	useEffect(() => {
		let cancelled = false;
		AsyncStorage.getItem(key)
			.then((saved) => {
				if (!cancelled && (saved === CustomListView.GRID || saved === CustomListView.LIST)) {
					setView(saved);
				}
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [key]);

	const update = useCallback(
		(next: CustomListView) => {
			setView(next);
			AsyncStorage.setItem(key, next).catch(() => {});
		},
		[key],
	);

	return [view, update];
}
