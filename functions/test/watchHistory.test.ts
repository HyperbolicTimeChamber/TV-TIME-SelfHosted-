import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase-admin/firestore";
import {
  aggregateHistory,
  historyPatch,
} from "../src/hooks/backfill/aggregateHistory";
import { pickLogo } from "../src/hooks/tmdb";

const at = (ms: number) => Timestamp.fromMillis(ms);

test("aggregateHistory: runtime × watchCount, plays, latest watch per show", () => {
  const totals = aggregateHistory(
    [
      { tmdbShowId: 1, runtime: 30, watchCount: 2, lastWatchedAt: at(100) },
      { tmdbShowId: 1, runtime: 45, watchCount: 1, lastWatchedAt: at(300) },
      { tmdbShowId: 2, runtime: 20, lastWatchedAt: at(50) }, // watchCount missing → 1
    ],
    [{ tmdbId: 9, runtime: 120, watchCount: 3, lastWatchedAt: at(200) }],
  );
  assert.deepEqual(
    { ...totals.get("tv_1"), historyAt: totals.get("tv_1")!.historyAt.toMillis() },
    { minutesWatched: 105, plays: 3, historyAt: 300 },
  );
  assert.equal(totals.get("tv_2")!.plays, 1);

  // Last Watched = the episode with the latest lastWatchedAt
  const withEps = aggregateHistory(
    [
      { tmdbShowId: 1, season: 1, episode: 5, lastWatchedAt: at(500) },
      { tmdbShowId: 1, season: 2, episode: 1, lastWatchedAt: at(100) },
    ],
    [],
  );
  assert.deepEqual(withEps.get("tv_1")!.lastEpisode, { season: 1, episode: 5 });
  assert.equal(totals.get("movie_9")!.minutesWatched, 360);
});

test("historyPatch: writes only when different; clears unwatched docs", () => {
  const totals = { historyAt: at(300), minutesWatched: 105, plays: 3 };
  assert.deepEqual(historyPatch({}, totals), totals);
  assert.equal(
    historyPatch({ historyAt: at(300), minutesWatched: 105, plays: 3 }, totals),
    null,
  );
  // Tracked, never watched → nothing to write
  assert.equal(historyPatch({ status: "watching" }, undefined), null);
  // Had history, now nothing watched → clear
  assert.deepEqual(historyPatch({ historyAt: at(1), plays: 2 }, undefined), {
    historyAt: null,
    plays: 0,
  });
});

test("pickLogo: English first, then language-neutral, else null", () => {
  assert.equal(
    pickLogo([
      { file_path: "/fr.png", iso_639_1: "fr" },
      { file_path: "/null.png", iso_639_1: null },
      { file_path: "/en.png", iso_639_1: "en" },
    ]),
    "/en.png",
  );
  assert.equal(pickLogo([{ file_path: "/null.png", iso_639_1: null }]), "/null.png");
  assert.equal(pickLogo([{ file_path: "/fr.png", iso_639_1: "fr" }]), null);
  assert.equal(pickLogo(undefined), null);
});
