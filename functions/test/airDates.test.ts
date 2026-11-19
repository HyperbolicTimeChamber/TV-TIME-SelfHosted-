import { test } from "node:test";
import assert from "node:assert/strict";
import { airDates14, airingItems, airingPushData, utcDate } from "../src/shared/airDates";
import { MediaType, NotificationType } from "../src/shared/enums";
import type { CatalogShow } from "../src/shared/types";

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0); // 2026-11-16 12:00 UTC

const ep = (episodeNumber: number, airDate: string | null, airStamp?: string) => ({
  episodeNumber,
  title: `Ep ${episodeNumber}`,
  overview: "",
  airDate,
  runtime: null,
  stillPath: null,
  ...(airStamp ? { airStamp } : {}),
});

const show = (episodes: ReturnType<typeof ep>[]) =>
  ({
    mediaType: MediaType.TV,
    title: "Scrubs",
    releaseDate: null,
    seasons: [{ seasonNumber: 2, episodeCount: episodes.length, airDate: null, episodes }],
  }) as unknown as CatalogShow;

test("utcDate is the UTC day", () => {
  assert.equal(utcDate(Date.UTC(2026, 10, 16, 23, 59)), "2026-11-16");
});

test("airDates14 keeps dates inside the window, both airDate and stamp day, sorted", () => {
  const s = show([
    ep(1, "2026-11-10"), // past
    ep(2, "2026-11-17", "2026-11-18T01:00:00+00:00"), // TMDB 17th, UTC 18th
    ep(3, "2026-11-30"), // day 14 — inside
    ep(4, "2026-12-01"), // day 15 — outside
    ep(5, null),
  ]);
  assert.deepEqual(airDates14(s, NOW), ["2026-11-17", "2026-11-18", "2026-11-30"]);
});

test("airDates14 for a movie is its release date when inside the window", () => {
  const movie = { mediaType: MediaType.MOVIE, releaseDate: "2026-11-20", seasons: [] } as unknown as CatalogShow;
  assert.deepEqual(airDates14(movie, NOW), ["2026-11-20"]);
  assert.deepEqual(airDates14({ ...movie, releaseDate: "2027-01-01" }, NOW), []);
  assert.deepEqual(airDates14({ ...movie, releaseDate: null }, NOW), []);
});

test("airingItems matches by date or by stamp day and sorts by episode", () => {
  const s = show([
    ep(3, "2026-11-17", "2026-11-18T01:00:00+00:00"),
    ep(1, "2026-11-17"),
    ep(2, "2026-11-25"),
  ]);
  const items = airingItems(s, ["2026-11-17", "2026-11-18"]);
  assert.deepEqual(items.map((i) => i.episode), [1, 3]);
  assert.equal(items[1].airStamp, "2026-11-18T01:00:00+00:00");
  assert.equal("airStamp" in items[0], false);
});

test("airingPushData: TV payload is strings, capped items, real count", () => {
  const many = Array.from({ length: 25 }, (_, i) => ep(i + 1, "2026-11-17", "2026-11-17T20:00:00+00:00"));
  const data = airingPushData("tv_1", { ...show(many), title: "Scrubs" }, ["2026-11-17"]);
  assert.ok(data);
  assert.equal(data.type, NotificationType.AIRING);
  assert.equal(data.docId, "tv_1");
  assert.equal(data.count, "25");
  assert.equal(JSON.parse(data.items).length, 20);
  for (const v of Object.values(data)) assert.equal(typeof v, "string");
});

test("airingPushData: nothing airing → null; movie on its release date", () => {
  assert.equal(airingPushData("tv_1", { ...show([ep(1, "2026-12-30")]), title: "X" }, ["2026-11-17"]), null);
  const movie = { mediaType: MediaType.MOVIE, title: "Film", releaseDate: "2026-11-17", seasons: [] } as unknown as CatalogShow;
  const data = airingPushData("movie_9", movie, ["2026-11-17", "2026-11-18"]);
  assert.equal(data?.releaseDate, "2026-11-17");
  assert.equal(data?.items, "[]");
  assert.equal(airingPushData("movie_9", movie, ["2026-11-19"]), null);
});
