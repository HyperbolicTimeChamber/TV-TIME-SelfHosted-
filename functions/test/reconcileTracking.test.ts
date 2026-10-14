import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import { reconcileTracking } from "../src/hooks/upcoming/reconcileTracking";
import {
  CatalogShow,
  CatalogSeason,
  CatalogEpisode,
} from "../src/shared/types";
import { fakeDb, trackingDoc } from "./helpers";

const ep = (
  n: number,
  title: string,
  airDate: string | null,
): CatalogEpisode => ({
  episodeNumber: n,
  title,
  airDate,
  overview: "",
  runtime: 30,
  stillPath: null,
});
const season = (n: number, eps: CatalogEpisode[]): CatalogSeason => ({
  seasonNumber: n,
  episodeCount: eps.length,
  airDate: null,
  episodes: eps,
});
const catalog = (seasons: CatalogSeason[], o: Partial<CatalogShow> = {}) =>
  ({
    tmdbId: 1,
    title: "Show",
    status: "Returning Series",
    seasons,
    totalEpisodes: seasons.reduce((a, s) => a + s.episodes.length, 0),
    ...o,
  }) as CatalogShow;
const s1 = season(1, [
  ep(1, "Pilot", "2025-01-01"),
  ep(2, "Two", "2025-01-08"),
]);
const ts = (d: string) => Timestamp.fromDate(new Date(d));
const watched = (...eps: Array<[number, number]>) =>
  eps.map(([s, e]) => ({ tmdbShowId: 1, season: s, episode: e }));

test("imported caught-up show with a new season is reactivated at the first new episode", async () => {
  const cat = catalog([
    s1,
    season(2, [
      ep(1, "Episode 1", "2026-10-01"),
      ep(2, "Episode 2", "2026-10-08"),
    ]),
  ]);
  const db = fakeDb(watched([1, 1], [1, 2]));
  const ov = await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "watching",
        nextEpisode: null,
        addedAt: ts("2025-06-01"),
      }),
    ],
    new Map([["tv_1", cat]]),
  );
  assert.equal(ov.get("tv_1"), "watching");
  const w = db.state.writes[0].data;
  assert.deepEqual(w.nextEpisode, { season: 2, episode: 1 });
  assert.equal(w.nextEpisodeAirDate, "2026-10-01");
  assert.equal(w.reconciledEpisodeCount, 4);
});

test("episodes appended to an existing season are picked up", async () => {
  const cat = catalog([
    season(1, [...s1.episodes, ep(3, "Three", "2026-10-05")]),
  ]);
  const db = fakeDb(watched([1, 1], [1, 2]));
  await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "completed",
        nextEpisode: null,
        addedAt: ts("2025-01-01"),
        lastWatchedAt: ts("2025-02-01"),
      }),
    ],
    new Map([["tv_1", cat]]),
  );
  assert.deepEqual(db.state.writes[0].data.nextEpisode, {
    season: 1,
    episode: 3,
  });
  assert.equal(db.state.writes[0].data.status, "watching");
});

test("archived show: old unwatched episodes don't bring it back", async () => {
  const db = fakeDb(watched([1, 1]));
  const ov = await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "completed",
        nextEpisode: null,
        addedAt: ts("2025-06-01"),
        lastWatchedAt: ts("2025-06-01"),
      }),
    ],
    new Map([["tv_1", catalog([s1])]]),
  );
  assert.equal(ov.size, 0);
  assert.deepEqual(db.state.writes[0].data, { reconciledEpisodeCount: 2 });
});

test("unchanged episode count → zero watchedEpisodes reads and no writes", async () => {
  const db = fakeDb();
  await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "completed",
        nextEpisode: null,
        reconciledEpisodeCount: 2,
      }),
    ],
    new Map([["tv_1", catalog([s1])]]),
  );
  assert.equal(db.state.queries, 0);
  assert.equal(db.state.writes.length, 0);
});

test("active pointer: placeholder name and missing air date refreshed without reads", async () => {
  const db = fakeDb();
  await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "watching",
        nextEpisode: { season: 1, episode: 1 },
        nextEpisodeName: "Episode 1",
        nextEpisodeAirDate: null,
      }),
    ],
    new Map([
      ["tv_1", catalog([season(1, [ep(1, "Real Name", "2026-10-12")])])],
    ]),
  );
  assert.equal(db.state.queries, 0);
  assert.deepEqual(db.state.writes[0].data, {
    nextEpisodeName: "Real Name",
    nextEpisodeAirDate: "2026-10-12",
  });
});

test("active pointer: nothing written when catalog has nothing better", async () => {
  const db = fakeDb();
  await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "watching",
        nextEpisode: { season: 1, episode: 1 },
        nextEpisodeName: "Episode 1",
        nextEpisodeAirDate: "2026-10-12",
      }),
    ],
    new Map([
      ["tv_1", catalog([season(1, [ep(1, "Episode 1", "2026-10-12")])])],
    ]),
  );
  assert.equal(db.state.writes.length, 0);
});

test("ended show still watching with nothing left → completed (no reads)", async () => {
  const db = fakeDb();
  const overrides = await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", { status: "watching", nextEpisode: null, plays: 2 }),
      // Pointer past the last episode counts as nothing left too
      trackingDoc("tv_2", { status: "watching", nextEpisode: { season: 1, episode: 3 }, plays: 2 }),
      // Still has an unwatched episode → untouched
      trackingDoc("tv_3", { status: "watching", nextEpisode: { season: 1, episode: 2 }, plays: 1 }),
      // Never started → untouched
      trackingDoc("tv_4", { status: "watching", nextEpisode: null }),
    ],
    new Map(
      ["tv_1", "tv_2", "tv_3", "tv_4"].map((id) => [id, catalog([s1], { status: "Canceled" })]),
    ),
  );
  assert.equal(db.state.queries, 0);
  assert.deepEqual(
    db.state.writes.map((w) => [w.path, w.data.status]),
    [
      ["users/u/tracking/tv_1", "completed"],
      ["users/u/tracking/tv_2", "completed"],
    ],
  );
  assert.equal(overrides.get("tv_1"), "completed");
});

test("ended shows are skipped entirely", async () => {
  const db = fakeDb();
  await reconcileTracking(
    db,
    "u",
    [trackingDoc("tv_1", { status: "completed", nextEpisode: null })],
    new Map([["tv_1", catalog([s1], { status: "Ended" })]]),
  );
  assert.equal(db.state.queries + db.state.writes.length, 0);
});

test("future first-new episode sets priorityDate to its air date", async () => {
  const cat = catalog([s1, season(2, [ep(1, "S2", "2099-01-01")])]);
  const db = fakeDb(watched([1, 2]));
  await reconcileTracking(
    db,
    "u",
    [
      trackingDoc("tv_1", {
        status: "completed",
        nextEpisode: null,
        addedAt: ts("2025-01-01"),
        lastWatchedAt: ts("2025-03-01"),
      }),
    ],
    new Map([["tv_1", cat]]),
  );
  const pd = db.state.writes[0].data.priorityDate as Timestamp;
  assert.equal(pd.toDate().toISOString().slice(0, 10), "2099-01-01");
});
