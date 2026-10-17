import { test } from "node:test";
import assert from "node:assert/strict";

// Viewer in India (UTC+5:30); Node picks up a changed TZ for new Date work
process.env.TZ = "Asia/Kolkata";

test("localAirDate: US Wednesday 8pm ET episode lands on Thursday in India", async () => {
	const { localAirDate } = await import("../src/utils/airTime");
	assert.equal(localAirDate("2026-02-25", "2026-02-26T01:00:00+00:00"), "2026-02-26");
	// No TVMaze time → TMDB date as is
	assert.equal(localAirDate("2026-02-25", undefined), "2026-02-25");
	assert.equal(localAirDate(null), null);
});

test("formatAirTime: phone-local hh:mm a", async () => {
	const { formatAirTime } = await import("../src/utils/airTime");
	// 00:00 UTC → 05:30 IST
	assert.equal(formatAirTime("2026-04-09T00:00:00Z"), "05:30 AM");
	assert.equal(formatAirTime("2026-04-09T14:45:00Z"), "08:15 PM");
	assert.equal(formatAirTime("2026-04-09T06:30:00Z"), "12:00 PM");
	assert.equal(formatAirTime("2026-04-08T18:30:00Z"), "12:00 AM");
	assert.equal(formatAirTime(undefined), null);
});

test("localizeCatalog rewrites stamped episodes only; nextEpisodeLocalAirDate prefers the catalog", async () => {
	const { localizeCatalog, nextEpisodeLocalAirDate, localizeUpcoming } = await import("../src/utils/airTime");
	const show = {
		seasons: [
			{
				seasonNumber: 1,
				episodes: [
					{ episodeNumber: 1, airDate: "2026-02-25", airStamp: "2026-02-26T01:00:00+00:00" },
					{ episodeNumber: 2, airDate: "2026-03-04" },
				],
			},
		],
	} as any;
	localizeCatalog(show);
	localizeCatalog(show); // idempotent
	assert.deepEqual(
		show.seasons[0].episodes.map((e: any) => e.airDate),
		["2026-02-26", "2026-03-04"],
	);
	assert.equal(nextEpisodeLocalAirDate({ season: 1, episode: 1 }, show, "2026-02-25"), "2026-02-26");
	assert.equal(nextEpisodeLocalAirDate({ season: 1, episode: 2 }, show, "2026-03-04"), "2026-03-04");
	assert.equal(nextEpisodeLocalAirDate(null, show, "2026-01-01"), "2026-01-01");
	assert.equal(
		localizeUpcoming({ airDate: "2026-02-25", airStamp: "2026-02-26T01:00:00+00:00" } as any).airDate,
		"2026-02-26",
	);
});

test("hasAired: exact time when known, else the day", async () => {
	const { hasAired } = await import("../src/utils/airTime");
	const now = Date.parse("2026-04-09T00:30:00Z");
	assert.equal(hasAired("2026-04-09T00:00:00Z", "2026-04-09", "2026-04-09", now), true);
	// Today, but its time hasn't come yet → not aired
	assert.equal(hasAired("2026-04-09T01:00:00Z", "2026-04-09", "2026-04-09", now), false);
	assert.equal(hasAired(undefined, "2026-04-09", "2026-04-09", now), true);
	assert.equal(hasAired(undefined, "2026-04-10", "2026-04-09", now), false);
	assert.equal(hasAired(undefined, null, "2026-04-09", now), false);
});
