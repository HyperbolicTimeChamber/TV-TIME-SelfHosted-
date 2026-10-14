import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProxyRequest } from "../src/hooks/tmdbProxy";

const ok = (path: string, query: Record<string, unknown> = {}) => {
  const r = resolveProxyRequest("GET", path, query);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r as Extract<typeof r, { ok: true }>;
};
const fail = (
  path: string,
  query: Record<string, unknown> = {},
  method = "GET",
) => {
  const r = resolveProxyRequest(method, path, query);
  assert.equal(r.ok, false);
  return r as Extract<typeof r, { ok: false }>;
};

test("allows search, trending, details and season endpoints", () => {
  assert.equal(
    ok("/api/tmdb/search/multi", { query: "lost", page: "2" }).tmdbPath,
    "/search/multi",
  );
  ok("/api/tmdb/search/tv", { query: "x" });
  ok("/api/tmdb/trending/all/week");
  ok("/api/tmdb/tv/1399", { append_to_response: "credits,similar" });
  ok("/api/tmdb/movie/550");
  ok("/api/tmdb/tv/1399/season/3");
});

test("rejects anything else", () => {
  assert.equal(fail("/api/tmdb/account/1").status, 404);
  assert.equal(fail("/api/tmdb/discover/tv").status, 404);
  assert.equal(fail("/api/tmdb/tv/abc").status, 404);
  assert.equal(fail("/api/tmdb/tv/1/season/1/episode/1").status, 404);
  assert.equal(
    fail("/api/tmdb/search/multi", { query: "x" }, "POST").status,
    405,
  );
});

test("drops unknown params, never forwards a caller api_key", () => {
  const r = ok("/api/tmdb/tv/1", {
    api_key: "stolen",
    foo: "bar",
    language: "en-US",
  });
  assert.deepEqual(r.params, { language: "en-US" });
});

test("validates params", () => {
  assert.equal(
    fail("/api/tmdb/search/multi").status,
    400,
    "search needs query",
  );
  fail("/api/tmdb/search/multi", { query: "x".repeat(101) });
  fail("/api/tmdb/search/multi", { query: "x", page: "0" });
  fail("/api/tmdb/search/multi", { query: "x", page: "abc" });
  fail("/api/tmdb/tv/1", { append_to_response: "videos" });
});

test("CDN cache lifetimes: search short, details long", () => {
  assert.equal(ok("/api/tmdb/search/multi", { query: "x" }).sMaxAge, 3600);
  assert.equal(ok("/api/tmdb/tv/1").sMaxAge, 86400);
});
