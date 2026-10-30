import { test } from "node:test";
import assert from "node:assert/strict";
import {
  batchCount,
  batchPages,
  mergeSearchPages,
  TtlCache,
} from "../src/hooks/searchTitles";
import { SearchScope } from "../src/shared/enums";
import { callerIp } from "../src/hooks/requireCaller";

const page = (n: number, results: Record<string, unknown>[], total = 9) => ({
  page: n,
  results,
  total_pages: total,
  total_results: total * 20,
});

test("a batch covers five TMDB pages, capped at TMDB's last", () => {
  assert.deepEqual(batchPages(1), [1, 2, 3, 4, 5]);
  assert.deepEqual(batchPages(2), [6, 7, 8, 9, 10]);
  assert.deepEqual(batchPages(100), [496, 497, 498, 499, 500]);
  assert.deepEqual(batchPages(101), []);
  assert.equal(batchCount(1), 1);
  assert.equal(batchCount(5), 1);
  assert.equal(batchCount(6), 2);
  assert.equal(batchCount(0), 0);
  assert.equal(batchCount(9999), 100);
});

test("multi search keeps TV + movies in page order, drops people and repeats", () => {
  const results = mergeSearchPages(
    [
      page(2, [
        { id: 3, media_type: "movie" },
        { id: 1, media_type: "tv" },
      ]),
      page(1, [
        { id: 1, media_type: "tv" },
        { id: 9, media_type: "person" },
        { id: 1, media_type: "movie" },
      ]),
    ],
    SearchScope.ALL,
  );
  assert.deepEqual(
    results.map((r) => `${r.media_type}_${r.id}`),
    ["tv_1", "movie_1", "movie_3"],
  );
});

test("single-type search fills in media_type", () => {
  const results = mergeSearchPages(
    [page(1, [{ id: 7, name: "Lost" }])],
    SearchScope.TV,
  );
  assert.deepEqual(results, [{ id: 7, name: "Lost", media_type: "tv" }]);
});

test("cache entries expire and the oldest go first past the cap", () => {
  let now = 0;
  const cache = new TtlCache<number>(100, 2, () => now);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  now = 100;
  assert.equal(cache.get("c"), undefined);
});

test("guest IP is the last X-Forwarded-For entry (earlier ones are client-supplied)", () => {
  const req = (xff: string | undefined, ip?: string) =>
    ({ rawRequest: { headers: { "x-forwarded-for": xff }, ip } }) as any;
  assert.equal(callerIp(req("1.1.1.1, 203.0.113.9")), "203.0.113.9");
  assert.equal(callerIp(req("203.0.113.9")), "203.0.113.9");
  assert.equal(callerIp(req(undefined, "10.0.0.1")), "10.0.0.1");
  assert.equal(callerIp(req(undefined)), "unknown");
});
