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

test("an episode with an exact air time ranks from that moment, above marks made earlier that day", () => {
	// Episode 10 out at 12:50 UTC; another show was marked 3 minutes before it
	const airStamp = "2026-11-07T12:50:00+00:00";
	const now = Date.parse("2026-11-07T15:00:00Z");
	const doctorX = {
		mediaType: MediaType.TV,
		priorityDate: ts(Date.parse("2026-11-06T20:00:00Z")),
		nextEpisode: { season: 1, episode: 10 },
		nextEpisodeAirDate: "2026-11-07",
		catalogShow: {
			mediaType: MediaType.TV,
			seasons: [{ seasonNumber: 1, episodes: [{ episodeNumber: 10, airDate: "2026-11-07", airStamp }] }],
		},
	} as any;
	const markedBefore = { mediaType: MediaType.TV, priorityDate: ts(Date.parse("2026-11-07T12:47:00Z")) } as any;
	assert.equal(getEffectivePriority(doctorX, now), Date.parse(airStamp));
	assert.ok(getEffectivePriority(doctorX, now) > getEffectivePriority(markedBefore, now));
	// Not aired yet: never past now
	assert.equal(getEffectivePriority(doctorX, Date.parse("2026-11-07T10:00:00Z")), Date.parse("2026-11-07T10:00:00Z"));
});
