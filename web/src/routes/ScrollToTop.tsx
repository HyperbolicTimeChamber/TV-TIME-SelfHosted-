import { useLayoutEffect } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

/**
 * Every page opens at the top. Back / forward (POP) is left alone so the browser
 * restores where you were (e.g. returning to a long list from a show page).
 */
export default function ScrollToTop() {
	const { pathname } = useLocation();
	const navigationType = useNavigationType();

	useLayoutEffect(() => {
		if (navigationType !== NavigationType.Pop) window.scrollTo(0, 0);
	}, [pathname, navigationType]);

	return null;
}
