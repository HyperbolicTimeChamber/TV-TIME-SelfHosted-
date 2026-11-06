import { test } from "node:test";
import assert from "node:assert/strict";
import { getEffectivePriority } from "../src/hooks/useVisibleTracking";
import { MediaType } from "../src/enums";

const ts = (ms: number) => ({ toMillis: () => ms });
const movie = (releaseDate: string, catalogRelease = releaseDate, priorityMs = 0) =>
	({
		mediaType: MediaType.MOVIE,
		releaseDate,
		priorityDate: ts(priorityMs),
		catalogShow: { mediaType: MediaType.MOVIE, releaseDate: catalogRelease },
	}) as any;

test("a movie released today ranks at local midnight, below a mark made later today", () => {
	const midnight = new Date(2026, 10, 5).getTime();
	const markedAt = midnight + 30 * 60_000; // 00:30 local
	const show = { mediaType: MediaType.TV, priorityDate: ts(markedAt), nextEpisodeAirDate: "2026-10-01" } as any;
	const released = movie("2026-11-05");
	assert.equal(getEffectivePriority(released, markedAt), midnight);
	assert.ok(getEffectivePriority(show, markedAt) > getEffectivePriority(released, markedAt));
});

test("a release date still ahead never outranks now", () => {
	const now = new Date(2026, 10, 5, 12).getTime();
	// Tracking says released, catalog has a later date
	const item = movie("2026-11-01", "2026-11-20", 1000);
	assert.equal(getEffectivePriority(item, now), new Date(2026, 10, 1).getTime());
	const future = movie("2026-11-20", "2026-11-20", 1000);
	assert.equal(getEffectivePriority(future, now), now);
});

test("a later priorityDate wins over the content date", () => {
	const now = new Date(2026, 10, 5, 12).getTime();
	assert.equal(getEffectivePriority(movie("2026-01-01", "2026-01-01", now - 5), now), now - 5);
});

test("a priorityDate stamped at the release day's UTC midnight counts as the release day", () => {
	// Release day, a few minutes in locally — UTC midnight may still be ahead (east of UTC)
	const midnight = new Date(2026, 10, 6).getTime();
	const markedAt = midnight + 10 * 60_000;
	const released = movie("2026-11-06", "2026-11-06", Date.UTC(2026, 10, 6));
	assert.equal(getEffectivePriority(released, markedAt), midnight);
	const show = { mediaType: MediaType.TV, priorityDate: ts(markedAt), nextEpisodeAirDate: "2026-10-01" } as any;
	assert.ok(getEffectivePriority(show, markedAt) > getEffectivePriority(released, markedAt));
});
