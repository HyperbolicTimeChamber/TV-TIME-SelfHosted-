import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAppUpdate } from "../src/utils/updateAnalytics";
import { UpdateSource } from "../src/enums";

test("a first install or the same build is not an update", () => {
	assert.equal(detectAppUpdate(0, 83, 0), null);
	assert.equal(detectAppUpdate(83, 83, 83), null);
	assert.equal(detectAppUpdate(84, 83, 0), null);
});

test("started from the drawer for this build: drawer", () => {
	assert.deepEqual(detectAppUpdate(82, 83, 83), { fromBuild: 82, source: UpdateSource.DRAWER });
});

test("no drawer download for this build: notification or other", () => {
	assert.deepEqual(detectAppUpdate(82, 83, 0), {
		fromBuild: 82,
		source: UpdateSource.NOTIFICATION_OR_OTHER,
	});
	assert.deepEqual(detectAppUpdate(81, 83, 82), {
		fromBuild: 81,
		source: UpdateSource.NOTIFICATION_OR_OTHER,
	});
});
