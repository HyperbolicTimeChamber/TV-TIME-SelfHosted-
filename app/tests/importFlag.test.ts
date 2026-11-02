import { test } from "node:test";
import assert from "node:assert/strict";
import { importDoneKey, mergeImportFlag } from "../src/utils/importFlag";

test("mergeImportFlag never turns the flag off", () => {
	assert.equal(mergeImportFlag(true, undefined), true);
	assert.equal(mergeImportFlag(true, false), true);
	assert.equal(mergeImportFlag(true, true), true);
});

test("mergeImportFlag turns it on from a source that has it", () => {
	assert.equal(mergeImportFlag(false, true), true);
	assert.equal(mergeImportFlag(false, undefined), false);
	assert.equal(mergeImportFlag(false, false), false);
});

test("importDoneKey is per account", () => {
	assert.notEqual(importDoneKey("a"), importDoneKey("b"));
});
