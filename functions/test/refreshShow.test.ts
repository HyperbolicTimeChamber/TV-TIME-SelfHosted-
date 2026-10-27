import { test } from "node:test";
import assert from "node:assert/strict";
import { seasonsToFetch } from "../src/hooks/tmdb";
import { hasNewEpisodes } from "../src/hooks/refreshShow/propagateRefresh";

const season = (seasonNumber: number, episodes: number[]) => ({
  seasonNumber,
  episodeCount: episodes.length,
  airDate: null,
  episodes: episodes.map((e) => ({
    episodeNumber: e,
    title: "",
    overview: "",
    airDate: null,
    runtime: null,
    stillPath: null,
  })),
});

test("seasonsToFetch: forced, new and resized seasons only (specials never)", () => {
  const listed = [
    { season_number: 0, episode_count: 2 },
    { season_number: 1, episode_count: 10 },
    { season_number: 2, episode_count: 8 },
    { season_number: 3, episode_count: 1 },
  ];
  const stored = [
    { seasonNumber: 1, episodeCount: 10 },
    { seasonNumber: 2, episodeCount: 6 },
  ];
  assert.deepEqual(seasonsToFetch(listed, stored, []), [2, 3]);
  assert.deepEqual(seasonsToFetch(listed, stored, [1]), [1, 2, 3]);
  assert.deepEqual(seasonsToFetch(listed.slice(0, 2), stored.slice(0, 1), []), []);
});

test("hasNewEpisodes: only episodes the old catalog didn't list count", () => {
  const old = { seasons: [season(1, [1, 2, 3])] };
  assert.equal(hasNewEpisodes(old, { seasons: [season(1, [1, 2, 3])] }), false);
  assert.equal(hasNewEpisodes(old, { seasons: [season(1, [1, 2])] }), false);
  assert.equal(hasNewEpisodes(old, { seasons: [season(1, [1, 2, 3, 4])] }), true);
  assert.equal(hasNewEpisodes(old, { seasons: [season(1, [1, 2, 3]), season(2, [1])] }), true);
  assert.equal(hasNewEpisodes(old, { seasons: [season(0, [1]), season(1, [1, 2, 3])] }), false);
});
