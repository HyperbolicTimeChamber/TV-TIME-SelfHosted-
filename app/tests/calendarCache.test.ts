import { test } from "node:test";
import assert from "node:assert/strict";
import { isCalendarCacheStale } from "../src/utils/calendarCache";

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
