import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_PROFILE_PREFS,
	clampListCount,
	mergeProfilePrefs,
	parseCachedPrefs,
	prefsFromDoc,
	profilePrefsDocFields,
	profilePrefsKey,
} from "../src/utils/profilePrefs";

test("defaults: five lists, completed rows on", () => {
	assert.deepEqual(DEFAULT_PROFILE_PREFS, { listCount: 5, showCompleted: true });
});

test("clampListCount keeps 0-10 whole numbers, anything else -> 5", () => {
	assert.equal(clampListCount(0), 0);
	assert.equal(clampListCount(10), 10);
	assert.equal(clampListCount(11), 10);
	assert.equal(clampListCount(-3), 0);
	assert.equal(clampListCount(3.6), 4);
	assert.equal(clampListCount("7"), 5);
	assert.equal(clampListCount(NaN), 5);
	assert.equal(clampListCount(undefined), 5);
	assert.equal(clampListCount(null), 5);
});

test("prefsFromDoc reads the user doc fields, missing -> defaults", () => {
	assert.deepEqual(prefsFromDoc({ profileListCount: 7, profileShowCompleted: false }), {
		listCount: 7,
		showCompleted: false,
	});
	assert.deepEqual(prefsFromDoc({}), DEFAULT_PROFILE_PREFS);
	assert.deepEqual(prefsFromDoc(undefined), DEFAULT_PROFILE_PREFS);
	assert.deepEqual(prefsFromDoc({ profileListCount: 99, profileShowCompleted: "no" }), {
		listCount: 10,
		showCompleted: true,
	});
});

test("parseCachedPrefs round-trips the saved JSON and survives junk", () => {
	const saved = JSON.stringify({ listCount: 2, showCompleted: false });
	assert.deepEqual(parseCachedPrefs(saved), { listCount: 2, showCompleted: false });
	assert.deepEqual(parseCachedPrefs(null), DEFAULT_PROFILE_PREFS);
	assert.deepEqual(parseCachedPrefs("{not json"), DEFAULT_PROFILE_PREFS);
	assert.deepEqual(parseCachedPrefs("null"), DEFAULT_PROFILE_PREFS);
});

test("mergeProfilePrefs applies only what is in the patch, clamping the count", () => {
	const base = { listCount: 5, showCompleted: true };
	assert.deepEqual(mergeProfilePrefs(base, { listCount: 8 }), {
		listCount: 8,
		showCompleted: true,
	});
	assert.deepEqual(mergeProfilePrefs(base, { showCompleted: false }), {
		listCount: 5,
		showCompleted: false,
	});
	assert.deepEqual(mergeProfilePrefs(base, { listCount: 42 }), {
		listCount: 10,
		showCompleted: true,
	});
	assert.deepEqual(mergeProfilePrefs(base, {}), base);
});

test("profilePrefsDocFields writes only the changed fields", () => {
	assert.deepEqual(profilePrefsDocFields({ listCount: 3 }), { profileListCount: 3 });
	assert.deepEqual(profilePrefsDocFields({ showCompleted: false }), {
		profileShowCompleted: false,
	});
	assert.deepEqual(profilePrefsDocFields({ listCount: 50, showCompleted: true }), {
		profileListCount: 10,
		profileShowCompleted: true,
	});
	assert.deepEqual(profilePrefsDocFields({}), {});
});

test("profilePrefsKey is per account", () => {
	assert.equal(profilePrefsKey("u1"), "profile_prefs_v1:u1");
});
