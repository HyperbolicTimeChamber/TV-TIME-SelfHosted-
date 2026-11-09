import { test } from "node:test";
import assert from "node:assert/strict";
import { isTabDesynced } from "../src/utils/tabDesync";

test("the pager on the focused tab's page is in step", () => {
	assert.equal(isTabDesynced(2, 2, 0.05), false);
	assert.equal(isTabDesynced(2, 2.04, 0.05), false);
});

test("off by more than the tolerance is a desync", () => {
	assert.equal(isTabDesynced(0, 1, 0.05), true);
	assert.equal(isTabDesynced(1, 0.9, 0.05), true);
});

test("an unreadable position counts as a desync", () => {
	assert.equal(isTabDesynced(0, Number.NaN, 0.05), true);
});
