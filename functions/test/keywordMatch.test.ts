import { test } from "node:test";
import assert from "node:assert/strict";
import { keywordMatches, regionAlias } from "../src/hooks/searchTitles/keywordMatch";
import { MediaType } from "../src/shared/enums";

test("keywordMatches keeps keywords that are the query, drops TMDB's fuzzy neighbours", () => {
  // TMDB's /search/keyword answers for "k-drama"
  assert.equal(keywordMatches("k-drama", "cdrama"), false);
  assert.equal(keywordMatches("k-drama", "jdrama"), false);
  assert.equal(keywordMatches("k-drama", "drama"), false);
  assert.equal(keywordMatches("k-drama", "kdrama"), true);
  assert.equal(keywordMatches("time travel", "time travel"), true);
  assert.equal(keywordMatches("Time Travel", "time travel romance"), true);
  assert.equal(keywordMatches("time travel", "travel"), false);
  assert.equal(keywordMatches("zombie", "zombie apocalypse"), true);
  assert.equal(keywordMatches("", "drama"), false);
});

test("regionAlias names regional genres however they're written", () => {
  for (const q of ["k-drama", "K Drama", "kdrama", "Korean drama", "k-dramas"]) {
    assert.equal(regionAlias(q)?.country, "KR", q);
  }
  assert.deepEqual(regionAlias("anime")?.types, [MediaType.TV, MediaType.MOVIE]);
  assert.equal(regionAlias("j-drama")?.country, "JP");
  assert.equal(regionAlias("Turkish drama")?.country, "TR");
  assert.equal(regionAlias("dizi")?.country, "TR");
  assert.equal(regionAlias("tw-drama")?.country, "TW");
  assert.equal(regionAlias("donghua")?.country, "CN");
  assert.equal(regionAlias("Bollywood")?.genre, undefined);
  assert.equal(regionAlias("drama"), undefined);
  assert.equal(regionAlias("breaking bad"), undefined);
});

test("studioAlias names studios / services however they're written", async () => {
  const { studioAlias } = await import("../src/hooks/searchTitles/keywordMatch");
  assert.deepEqual(studioAlias("Disney")?.companies, [2, 6125]);
  assert.deepEqual(studioAlias("Studio Ghibli")?.companies, [10342]);
  assert.deepEqual(studioAlias("HBO")?.networks, [49]);
  assert.deepEqual(studioAlias("Apple TV+")?.networks, [2552]);
  assert.equal(studioAlias("Warner Bros.")?.companies?.[0], 174);
  assert.equal(studioAlias("breaking bad"), undefined);
});
