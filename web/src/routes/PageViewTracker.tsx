import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { Route } from "@app/enums";
import { trackPageViewed } from "@app/services/mixpanel";
import { Paths } from "./paths";

/** Web routes reported under the app's screen names, so page_viewed merges both platforms */
const PAGE_NAMES: [string, string][] = [
	[Paths.ROOT, Route.WATCHLIST],
	[Paths.HOME, Route.WATCHLIST],
	[Paths.UPCOMING, Route.UPCOMING],
	[Paths.CALENDAR, Route.CALENDAR_MAIN],
	[Paths.SEARCH, Route.SEARCH_MAIN],
	[Paths.SEARCH_INPUT, Route.SEARCH_INPUT],
	[Paths.PROFILE, Route.PROFILE_MAIN],
	[Paths.SETTINGS, Route.SETTINGS],
	[Paths.WATCH_HISTORY, Route.WATCH_HISTORY],
	[Paths.IMPORT, Route.IMPORT_DATA],
	[Paths.SHOW, Route.SHOW_DETAIL],
];

/** Sends page_viewed for each route change */
export default function PageViewTracker() {
	const { pathname } = useLocation();

	useEffect(() => {
		const page = PAGE_NAMES.find(([path]) => matchPath(path, pathname))?.[1] ?? pathname;
		trackPageViewed(page);
	}, [pathname]);

	return null;
}
