import { Route } from "../types";

export type MainTab = Route.HOME | Route.CALENDAR | Route.SEARCH | Route.PROFILE;

const ALL_TABS: MainTab[] = [Route.HOME, Route.CALENDAR, Route.SEARCH, Route.PROFILE];

/** The bottom tabs in order — Calendar is optional (Settings -> Calendar) */
export function mainTabs(calendarEnabled: boolean): MainTab[] {
	return calendarEnabled ? ALL_TABS : ALL_TABS.filter((tab) => tab !== Route.CALENDAR);
}
