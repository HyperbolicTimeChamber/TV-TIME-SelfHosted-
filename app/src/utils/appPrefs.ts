import { CALENDAR_LOAD_MAX, CALENDAR_LOAD_STEP, Route } from "../enums";

/** Per-device Home / Calendar settings (Settings -> Home, Settings -> Calendar) */

export type HomeStartTab = Route.WATCHLIST | Route.UPCOMING;

export interface AppPrefs {
	/** The Home tab shown when the app is opened, and again when it comes back from the background */
	homeTab: HomeStartTab;
	/** Off: no Calendar page or tab-bar icon, and nothing is loaded for it */
	calendarEnabled: boolean;
	/** What the Calendar loads by itself: 0 = the current month, else this many days from today */
	calendarLoadDays: number;
}

export const DEFAULT_APP_PREFS: AppPrefs = {
	homeTab: Route.WATCHLIST,
	calendarEnabled: true,
	calendarLoadDays: 0,
};

/** 0, or a whole step up to the maximum */
export function clampLoadDays(days: unknown): number {
	if (typeof days !== "number" || !Number.isFinite(days)) return 0;
	const stepped = Math.round(days / CALENDAR_LOAD_STEP) * CALENDAR_LOAD_STEP;
	return Math.min(CALENDAR_LOAD_MAX, Math.max(0, stepped));
}

/** The saved settings; anything missing or unreadable falls back to its default */
export function parseAppPrefs(raw: string | null | undefined): AppPrefs {
	let data: any = null;
	try {
		data = raw ? JSON.parse(raw) : null;
	} catch {}
	return {
		homeTab: data?.homeTab === Route.UPCOMING ? Route.UPCOMING : Route.WATCHLIST,
		calendarEnabled: data?.calendarEnabled !== false,
		calendarLoadDays: clampLoadDays(data?.calendarLoadDays),
	};
}

export function loadDaysLabel(days: number): string {
	return days === 0 ? "This month" : `Next ${days} days`;
}
