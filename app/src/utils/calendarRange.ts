import { addDays } from "./calendarGrid";

/**
 * Which days the Calendar loads (Settings -> Calendar). A month's cache covers a span of its days:
 * the whole month, or the part inside the load window.
 */

/** Inclusive, "YYYY-MM-DD" */
export interface DateSpan {
	from: string;
	to: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026-11" → its first and last day */
export function monthSpan(monthKey: string): DateSpan {
	const [year, month] = monthKey.split("-").map(Number);
	const lastDay = new Date(year, month, 0).getDate();
	return { from: `${monthKey}-01`, to: `${monthKey}-${pad2(lastDay)}` };
}

/** The days loaded without being asked: today's month (days = 0), else today and the days after it */
export function loadWindow(today: string, days: number): DateSpan {
	return days > 0 ? { from: today, to: addDays(today, days) } : monthSpan(today.slice(0, 7));
}

/** Every month the window touches, in order */
export function windowMonths(window: DateSpan): { year: number; month: number }[] {
	const months: { year: number; month: number }[] = [];
	let [year, month] = window.from.split("-").map(Number);
	while (`${year}-${pad2(month)}` <= window.to.slice(0, 7)) {
		months.push({ year, month });
		month += 1;
		if (month > 12) {
			month = 1;
			year += 1;
		}
	}
	return months;
}

/** The part of a month inside the window, or null when the window doesn't reach it */
export function neededSpan(monthKey: string, today: string, days: number): DateSpan | null {
	const month = monthSpan(monthKey);
	const window = loadWindow(today, days);
	const from = month.from > window.from ? month.from : window.from;
	const to = month.to < window.to ? month.to : window.to;
	return from <= to ? { from, to } : null;
}

export const spanIncludes = (span: DateSpan, date: string) => date >= span.from && date <= span.to;

export const spanCovers = (have: DateSpan, need: DateSpan) =>
	have.from <= need.from && have.to >= need.to;

export const spanUnion = (a: DateSpan, b: DateSpan): DateSpan => ({
	from: a.from < b.from ? a.from : b.from,
	to: a.to > b.to ? a.to : b.to,
});

export interface MonthLoadState {
	monthKey: string;
	today: string;
	/** AppPrefs.calendarLoadDays */
	days: number;
	cached: boolean;
	/** The cached month's span; undefined = the whole month */
	coverage?: DateSpan;
	/** The backend synced since the cached month was built */
	stale: boolean;
	/** The user asked for this month (the Load button) */
	asked: boolean;
}

/**
 * The days of a month to build now, or null for none. A month outside the window is only built when
 * asked for (whole); a cached one there is left as it is.
 */
export function planMonthLoad(s: MonthLoadState): DateSpan | null {
	const whole = monthSpan(s.monthKey);
	const have = s.coverage ?? whole;
	if (s.asked) return !s.cached || s.stale || !spanCovers(have, whole) ? whole : null;
	const need = neededSpan(s.monthKey, s.today, s.days);
	if (!need) return null;
	if (!s.cached) return need;
	return s.stale || !spanCovers(have, need) ? spanUnion(have, need) : null;
}

/** What the day list offers for a date: nothing, load its month, or load it again (out of date) */
export enum CalendarDayAction {
	NONE = "none",
	LOAD = "load",
	REFRESH = "refresh",
}

export function dayAction(s: Omit<MonthLoadState, "monthKey" | "asked"> & { date: string }): CalendarDayAction {
	const monthKey = s.date.slice(0, 7);
	const need = neededSpan(monthKey, s.today, s.days);
	// Inside the window it loads by itself
	if (need && spanIncludes(need, s.date)) return CalendarDayAction.NONE;
	if (!s.cached || !spanIncludes(s.coverage ?? monthSpan(monthKey), s.date)) return CalendarDayAction.LOAD;
	// Cached from before: shown as it is; a month the window doesn't reach only updates when asked
	return s.stale && !need ? CalendarDayAction.REFRESH : CalendarDayAction.NONE;
}
