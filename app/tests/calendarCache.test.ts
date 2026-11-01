import { test } from "node:test";
import assert from "node:assert/strict";
import { calendarCacheForUser, isCalendarCacheStale } from "../src/utils/calendarCache";

test("cache built before the latest catalog sync is stale", () => {
	assert.equal(isCalendarCacheStale("2026-10-11T03:00:00.000Z", "2026-10-18T03:05:57.914Z"), true);
});

test("cache with no recorded sync is stale once the server has one", () => {
	assert.equal(isCalendarCacheStale(undefined, "2026-10-18T03:05:57.914Z"), true);
	assert.equal(isCalendarCacheStale(null, "2026-10-18T03:05:57.914Z"), true);
});

test("cache from the current sync, or no server sync known, is kept", () => {
	assert.equal(isCalendarCacheStale("2026-10-18T03:05:57.914Z", "2026-10-18T03:05:57.914Z"), false);
	assert.equal(isCalendarCacheStale(undefined, null), false);
});

test("cached months belong to the account that built them", () => {
	const months = { "2026-11": [] };
	assert.deepEqual(calendarCacheForUser({ userId: "a", months }, "a").months, months);
	// Another account's months (or a legacy cache with no owner) are dropped
	assert.deepEqual(calendarCacheForUser({ userId: "b", months }, "a"), { userId: "a", months: {} });
	assert.deepEqual(calendarCacheForUser({ months }, "a"), { userId: "a", months: {} });
	assert.deepEqual(calendarCacheForUser(null, "a"), { userId: "a", months: {} });
});
