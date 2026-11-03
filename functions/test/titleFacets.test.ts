import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFacetDelta, countFacets, keywordNames, titleFacets } from "../src/shared/titleFacets";

test("countFacets: each value once per title, no duplicates", () => {
  assert.deepEqual(
    countFacets([
      { genres: ["Comedy", "Comedy"], keywords: ["office"] },
      { genres: ["Comedy", "Drama"], keywords: [] },
    ]),
    { genres: { Comedy: 2, Drama: 1 }, keywords: { office: 1 } },
  );
});

test("applyFacetDelta: add, swap and remove; values at 0 are dropped", () => {
  const start = { genres: { Comedy: 2, Drama: 1 }, keywords: { office: 1 } };
  assert.deepEqual(applyFacetDelta(start, null, { genres: ["Drama"], keywords: ["boss"] }), {
    genres: { Comedy: 2, Drama: 2 },
    keywords: { office: 1, boss: 1 },
  });
  assert.deepEqual(applyFacetDelta(start, { genres: ["Drama"], keywords: ["office"] }, null), {
    genres: { Comedy: 2 },
    keywords: {},
  });
  // Never below 0 even when the doc missed the add (pre-aggregate data)
  assert.deepEqual(applyFacetDelta(undefined, { genres: ["Anime"] }, null), {
    genres: {},
    keywords: {},
  });
});

test("keywordNames / titleFacets: lowercase, unique", () => {
  assert.deepEqual(
    keywordNames([
      { id: 1, name: "Time Travel" },
      { id: 2, name: " time travel " },
      { id: 3, name: "Anime" },
    ]),
    ["time travel", "anime"],
  );
  assert.deepEqual(titleFacets({ genres: ["A", "A"] }), { genres: ["A"], keywords: [] });
});
