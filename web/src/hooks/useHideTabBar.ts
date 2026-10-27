import { useEffect } from "react";
import { useAppDispatch } from "../store";
import { setTabBarHidden } from "../store/uiSlice";

/** Full-screen page: hide the bottom tab bar while mounted (app: route in DETAIL_ROUTES) */
export function useHideTabBar(hide = true) {
	const dispatch = useAppDispatch();
	useEffect(() => {
		if (!hide) return;
		dispatch(setTabBarHidden(true));
		return () => {
			dispatch(setTabBarHidden(false));
		};
	}, [hide, dispatch]);
}
