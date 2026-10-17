import { createContext, useContext } from "react";
import { Route } from "../../types";

export type HomeTab = Route.WATCHLIST | Route.UPCOMING;

/** Which Home tab shows (Watch List / Upcoming) and a way to switch */
export const HomeTabsContext = createContext<{ tab: HomeTab; setTab: (tab: HomeTab) => void }>({
	tab: Route.WATCHLIST,
	setTab: () => {},
});

export const useHomeTabs = () => useContext(HomeTabsContext);
