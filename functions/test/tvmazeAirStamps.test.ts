import { test } from "node:test";
import assert from "node:assert/strict";
import { episodeAirStamp, type TvmazeEpisode, type TvmazeShow } from "../src/hooks/tvmaze";
import { zonedTimeToUtc } from "../src/shared/zonedTime";

const untimed = (airdate: string): TvmazeEpisode => ({
  season: 1,
  number: 7,
  airdate,
  airtime: "",
  // TVMaze's filler for an unknown time
  airstamp: `${airdate}T12:00:00+00:00`,
});
const web = (name: string, timezone?: string): TvmazeShow => ({
  network: null,
  webChannel: { name, country: timezone ? { timezone } : null },
});

test("zonedTimeToUtc handles both sides of a DST switch", () => {
  // PDT (UTC-7) before Nov 1 2026, PST (UTC-8) after
  assert.equal(zonedTimeToUtc("2026-10-27", "18:00", "America/Los_Angeles").toISOString(), "2026-10-28T01:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-11-03", "18:00", "America/Los_Angeles").toISOString(), "2026-11-04T02:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-07-10", "00:00", "America/New_York").toISOString(), "2026-07-10T04:00:00.000Z");
  assert.equal(zonedTimeToUtc("2026-11-03", "00:00", "UTC").toISOString(), "2026-11-03T00:00:00.000Z");
});

test("a real TVMaze time is kept as is", () => {
  const ep: TvmazeEpisode = { ...untimed("2026-11-03"), airtime: "21:00", airstamp: "2026-11-04T02:00:00+00:00" };
  assert.equal(episodeAirStamp(ep, web("Disney+")), "2026-11-04T02:00:00+00:00");
});

test("untimed streaming episodes get their service's release time, not the noon UTC filler", () => {
  // VisionQuest E7: Disney+ 6pm PT Nov 3 → Nov 4 03:00 CET (the filler made it Nov 3 13:00 CET)
  assert.equal(episodeAirStamp(untimed("2026-11-03"), web("Disney+")), "2026-11-04T02:00:00.000Z");
  assert.equal(episodeAirStamp(untimed("2026-07-10"), web("Netflix")), "2026-07-10T07:00:00.000Z");
  assert.equal(episodeAirStamp(untimed("2026-07-10"), web("Prime Video")), "2026-07-10T00:00:00.000Z");
  assert.equal(episodeAirStamp(untimed("2026-07-10"), web("Apple TV+")), "2026-07-10T04:00:00.000Z");
  assert.equal(episodeAirStamp(untimed("2026-07-10"), web("HBO Max")), "2026-07-10T07:00:00.000Z");
});

test("no known service: noon in the studio's timezone, else TVMaze's value", () => {
  // Untimed network episode → the network's zone
  const bbc: TvmazeShow = { network: { name: "BBC One", country: { timezone: "Europe/London" } } };
  assert.equal(episodeAirStamp(untimed("2026-07-10"), bbc), "2026-07-10T11:00:00.000Z");
  // Unknown streamer without a zone → TMDB origin country (US → Los Angeles)
  assert.equal(episodeAirStamp(untimed("2026-11-03"), web("Some New Streamer"), "US"), "2026-11-03T20:00:00.000Z");
  assert.equal(episodeAirStamp(untimed("2026-11-03"), web("Some New Streamer"), "JP"), "2026-11-03T03:00:00.000Z");
  // Nothing to go on → TVMaze's filler stays
  assert.equal(episodeAirStamp(untimed("2026-11-03"), web("Some New Streamer")), "2026-11-03T12:00:00+00:00");
  // No airstamp at all → none
  assert.equal(episodeAirStamp({ ...untimed("2026-11-03"), airstamp: null }, web("Disney+")), null);
});
