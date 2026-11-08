import { test } from "node:test";
import assert from "node:assert/strict";
import { localReleaseLine, releaseStatLabel } from "../src/utils/localRelease";

const NOW = new Date(2026, 10, 8);

test("the release stat says RELEASING only while the date is ahead", () => {
	assert.equal(releaseStatLabel("2026-11-11", NOW), "RELEASING");
	assert.equal(releaseStatLabel("2026-11-08", NOW), "RELEASED");
	assert.equal(releaseStatLabel("2025-07-10", NOW), "RELEASED");
	assert.equal(releaseStatLabel(undefined, NOW), "RELEASED");
});

test("no local date or no country: nothing to show", () => {
	assert.equal(localReleaseLine(null, "India", NOW), null);
	assert.equal(localReleaseLine(undefined, "India", NOW), null);
	assert.equal(localReleaseLine("2025-07-24", undefined, NOW), null);
});

test("a local date: the country and the full date", () => {
	assert.equal(localReleaseLine("2025-07-24", "India", NOW), "Released in India on 24 Jul 2025");
});

test("today counts as released, tomorrow doesn't", () => {
	assert.equal(localReleaseLine("2026-11-08", "Japan", NOW), "Released in Japan on 8 Nov 2026");
	assert.equal(localReleaseLine("2026-11-09", "Japan", NOW), "Releasing in Japan on 9 Nov 2026");
});
