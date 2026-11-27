import { test } from "node:test";
import assert from "node:assert/strict";

import {
	CalendarDayAction,
	dayAction,
	loadWindow,
	monthSpan,
	neededSpan,
	planMonthLoad,
	windowMonths,
} from "../src/utils/calendarRange";

const today = "2026-11-20";
const base = { today, days: 0, cached: false, stale: false, asked: false };

test("default window is today's month", () => {
	assert.deepEqual(loadWindow(today, 0), { from: "2026-11-01", to: "2026-11-30" });
	assert.deepEqual(windowMonths(loadWindow(today, 0)), [{ year: 2026, month: 11 }]);
});

test("a day window runs from today and can cross a year", () => {
	assert.deepEqual(loadWindow(today, 20), { from: today, to: "2026-12-10" });
	assert.deepEqual(windowMonths(loadWindow(today, 50)), [
		{ year: 2026, month: 11 },
		{ year: 2026, month: 12 },
		{ year: 2027, month: 1 },
	]);
});

test("only the part of a month inside the window is needed", () => {
	assert.deepEqual(neededSpan("2026-11", today, 20), { from: today, to: "2026-11-30" });
	assert.deepEqual(neededSpan("2026-12", today, 20), { from: "2026-12-01", to: "2026-12-10" });
	assert.equal(neededSpan("2027-01", today, 20), null);
	assert.equal(neededSpan("2026-10", today, 100), null);
});

test("months outside the window load only when asked, and then whole", () => {
	assert.equal(planMonthLoad({ ...base, monthKey: "2026-12" }), null);
	assert.deepEqual(planMonthLoad({ ...base, monthKey: "2026-12", asked: true }), monthSpan("2026-12"));
	// Already cached whole and current: nothing to do
	assert.equal(planMonthLoad({ ...base, monthKey: "2026-12", asked: true, cached: true }), null);
	// A cached month outside the window is left alone even when out of date
	assert.equal(planMonthLoad({ ...base, monthKey: "2026-09", cached: true, stale: true }), null);
});

test("a cached span is rebuilt only when it doesn't cover what's needed", () => {
	const coverage = { from: "2026-12-01", to: "2026-12-10" };
	const s = { ...base, days: 20, monthKey: "2026-12", cached: true, coverage };
	assert.equal(planMonthLoad(s), null);
	// The next day the window reaches one day further
	assert.deepEqual(planMonthLoad({ ...s, today: "2026-11-21" }), {
		from: "2026-12-01",
		to: "2026-12-11",
	});
	// Asking for the rest of the month
	assert.deepEqual(planMonthLoad({ ...s, asked: true }), monthSpan("2026-12"));
	// A stale rebuild keeps the days it already had
	assert.deepEqual(
		planMonthLoad({ ...s, days: 10, monthKey: "2026-11", stale: true, coverage: { from: "2026-11-05", to: "2026-11-25" } }),
		{ from: "2026-11-05", to: "2026-11-30" },
	);
});

test("a month cached whole satisfies any window", () => {
	assert.equal(planMonthLoad({ ...base, days: 30, monthKey: "2026-11", cached: true }), null);
});

test("what a date offers", () => {
	const s = { today, days: 20, cached: false, stale: false };
	// Inside the window: loads by itself
	assert.equal(dayAction({ ...s, date: "2026-11-25" }), CalendarDayAction.NONE);
	// Earlier this month, and beyond the window: a Load button
	assert.equal(dayAction({ ...s, date: "2026-11-05" }), CalendarDayAction.LOAD);
	assert.equal(dayAction({ ...s, date: "2027-03-01" }), CalendarDayAction.LOAD);
	// Cached but only part of the month
	const coverage = { from: today, to: "2026-11-30" };
	assert.equal(dayAction({ ...s, cached: true, coverage, date: "2026-11-05" }), CalendarDayAction.LOAD);
	// Cached whole: shown; out of date and outside the window: an Update button
	assert.equal(dayAction({ ...s, cached: true, date: "2026-09-05" }), CalendarDayAction.NONE);
	assert.equal(
		dayAction({ ...s, cached: true, stale: true, date: "2026-09-05" }),
		CalendarDayAction.REFRESH,
	);
	// Earlier days of a month the window rebuilds anyway
	assert.equal(dayAction({ ...s, cached: true, stale: true, date: "2026-11-05" }), CalendarDayAction.NONE);
});
