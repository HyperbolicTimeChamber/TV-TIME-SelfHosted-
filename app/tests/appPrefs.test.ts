import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_APP_PREFS, clampLoadDays, loadDaysLabel, parseAppPrefs } from "../src/utils/appPrefs";
import {
	cleanDisplayName,
	displayNameOf,
	parseLocalProfile,
	photoExtension,
	EMPTY_LOCAL_PROFILE,
} from "../src/utils/localProfile";
import { Route } from "../src/enums";

test("app settings default to Watch List, Calendar on, current month", () => {
	assert.deepEqual(parseAppPrefs(null), DEFAULT_APP_PREFS);
	assert.deepEqual(parseAppPrefs("not json"), DEFAULT_APP_PREFS);
	assert.equal(DEFAULT_APP_PREFS.homeTab, Route.WATCHLIST);
	assert.equal(DEFAULT_APP_PREFS.calendarEnabled, true);
	assert.equal(DEFAULT_APP_PREFS.calendarLoadDays, 0);
});

test("saved app settings are read back; bad values fall back", () => {
	const saved = { homeTab: Route.UPCOMING, calendarEnabled: false, calendarLoadDays: 40 };
	assert.deepEqual(parseAppPrefs(JSON.stringify(saved)), saved);
	assert.equal(parseAppPrefs(JSON.stringify({ homeTab: "Profile" })).homeTab, Route.WATCHLIST);
});

test("load days snap to steps of 10 between 0 and 100", () => {
	assert.equal(clampLoadDays(-10), 0);
	assert.equal(clampLoadDays(14), 10);
	assert.equal(clampLoadDays(1000), 100);
	assert.equal(clampLoadDays("30"), 0);
	assert.equal(loadDaysLabel(0), "This month");
	assert.equal(loadDaysLabel(60), "Next 60 days");
});

test("a typed name is tidied and capped; empty means none", () => {
	assert.equal(cleanDisplayName("  Monkey   D.  Luffy "), "Monkey D. Luffy");
	assert.equal(cleanDisplayName("   "), null);
	assert.equal(cleanDisplayName("a".repeat(60))?.length, 40);
});

test("the device name wins over the account's, then a placeholder", () => {
	assert.equal(displayNameOf({ name: "Chris", photo: null }, "Account"), "Chris");
	assert.equal(displayNameOf(EMPTY_LOCAL_PROFILE, "Account"), "Account");
	assert.equal(displayNameOf(EMPTY_LOCAL_PROFILE, ""), "User");
});

test("a saved local profile is read back; bad data is empty", () => {
	assert.deepEqual(parseLocalProfile('{"name":" A ","photo":"p.jpg"}'), { name: "A", photo: "p.jpg" });
	assert.deepEqual(parseLocalProfile("{"), EMPTY_LOCAL_PROFILE);
	assert.deepEqual(parseLocalProfile('{"name":5,"photo":""}'), EMPTY_LOCAL_PROFILE);
});

test("a picked photo keeps a known image extension", () => {
	assert.equal(photoExtension("IMG.PNG"), "png");
	assert.equal(photoExtension("photo", "image/webp"), "webp");
	assert.equal(photoExtension("x.exe", "application/octet-stream"), "jpg");
});
