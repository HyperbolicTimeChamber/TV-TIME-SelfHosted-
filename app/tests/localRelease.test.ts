import { test } from "node:test";
import assert from "node:assert/strict";
import {
	localReleaseSentence,
	localReleaseText,
	releaseStatLabel,
} from "../src/utils/localRelease";

const NOW = new Date(2026, 10, 8);

test("the release stat says RELEASING only while the date is ahead", () => {
	assert.equal(releaseStatLabel("2026-11-11", NOW), "RELEASING");
	assert.equal(releaseStatLabel("2026-11-08", NOW), "RELEASED");
	assert.equal(releaseStatLabel("2025-07-10", NOW), "RELEASED");
	assert.equal(releaseStatLabel(undefined, NOW), "RELEASED");
});

test("no local date or no country: nothing to show", () => {
	assert.equal(localReleaseText(null, "India", NOW), null);
	assert.equal(localReleaseText(undefined, "India", NOW), null);
	assert.equal(localReleaseText("2025-07-24", undefined, NOW), null);
});

test("a local date: the country as the label, the full date", () => {
	assert.deepEqual(localReleaseText("2025-07-24", "India", NOW), {
		label: "Released in India",
		date: "24 Jul 2025",
	});
});

test("the drawer's one line", () => {
	assert.equal(
		localReleaseSentence({ label: "Released in India", date: "24 Jul 2025" }),
		"Released in India on 24 Jul 2025",
	);
});

test("today counts as released, tomorrow doesn't", () => {
	assert.equal(localReleaseText("2026-11-08", "Japan", NOW)?.label, "Released in Japan");
	assert.equal(localReleaseText("2026-11-09", "Japan", NOW)?.label, "Releasing in Japan");
});
