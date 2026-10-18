import { test } from "node:test";
import assert from "node:assert/strict";
import { premiereDate } from "../src/hooks/tmdb";

const ep = (airDate: string | null) => ({ episodeNumber: 1, title: "", overview: "", airDate, runtime: null, stillPath: null });
const season = (seasonNumber: number, airDate: string | null, episodes = [ep(null)]) => ({
  seasonNumber,
  airDate,
  episodes,
});

test("TMDB's first_air_date wins when present", () => {
  assert.equal(premiereDate("2020-01-01", [season(1, "2019-05-05")]), "2020-01-01");
});

test("missing first_air_date → earliest regular season air date (specials ignored)", () => {
  assert.equal(
    premiereDate(undefined, [season(0, "2001-01-01"), season(2, "2027-01-01"), season(1, "2026-10-15")]),
    "2026-10-15",
  );
});

test("no season dates → earliest episode air date", () => {
  assert.equal(premiereDate("", [season(1, null, [ep("2026-11-02"), ep("2026-10-20")])]), "2026-10-20");
});

test("nothing known → null", () => {
  assert.equal(premiereDate(null, [season(1, null)]), null);
  assert.equal(premiereDate(null), null);
});
