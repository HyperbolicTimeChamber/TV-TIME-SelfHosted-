import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFacetDelta,
  countFacets,
  countryCodes,
  facetIndexEntry,
  keywordNames,
  sameFacets,
  studioNames,
  titleFacets,
} from "../src/shared/titleFacets";

test("countFacets: each value once per title, no duplicates", () => {
  assert.deepEqual(
    countFacets([
      { genres: ["Comedy", "Comedy"], keywords: ["office"], countries: ["US"], studios: ["NBC"] },
      { genres: ["Comedy", "Drama"], keywords: [], countries: ["KR", "KR"] },
    ]),
    {
      genres: { Comedy: 2, Drama: 1 },
      keywords: { office: 1 },
      countries: { US: 1, KR: 1 },
      studios: { NBC: 1 },
    },
  );
});

test("applyFacetDelta: add, swap and remove; values at 0 are dropped", () => {
  const start = { genres: { Comedy: 2, Drama: 1 }, keywords: { office: 1 }, countries: { US: 2 } };
  assert.deepEqual(
    applyFacetDelta(start, null, { genres: ["Drama"], keywords: ["boss"], countries: ["KR"] }),
    {
      genres: { Comedy: 2, Drama: 2 },
      keywords: { office: 1, boss: 1 },
      countries: { US: 2, KR: 1 },
      studios: {},
    },
  );
  assert.deepEqual(
    applyFacetDelta(start, { genres: ["Drama"], keywords: ["office"], countries: ["US"] }, null),
    { genres: { Comedy: 2 }, keywords: {}, countries: { US: 1 }, studios: {} },
  );
  // Never below 0 even when the doc missed the add (pre-aggregate data); a doc from before
  // countries were counted gains the field
  assert.deepEqual(applyFacetDelta(undefined, { genres: ["Anime"] }, null), {
    genres: {},
    keywords: {},
    countries: {},
    studios: {},
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
  assert.deepEqual(titleFacets({ genres: ["A", "A"] }), {
    genres: ["A"],
    keywords: [],
    countries: [],
    studios: [],
  });
});

test("countryCodes: upper-case two-letter codes, unique; sameFacets sees a countries change", () => {
  assert.deepEqual(countryCodes(["kr", "KR", " us", "XYZ", ""]), ["KR", "US"]);
  assert.deepEqual(countryCodes(undefined), []);
  const facets = titleFacets({ genres: ["Drama"], keywords: [], countries: ["KR"] });
  assert.equal(sameFacets({ genres: ["Drama"], keywords: [] }, facets), false);
  assert.equal(
    sameFacets({ genres: ["Drama"], keywords: [], countries: ["KR"], studios: [] }, facets),
    true,
  );
});

test("studioNames: networks first, then companies; unique, capped", () => {
  assert.deepEqual(
    studioNames([{ name: "HBO" }], [{ name: "HBO" }, { name: " Warner Bros. Television " }, {}]),
    ["HBO", "Warner Bros. Television"],
  );
  assert.equal(studioNames(undefined, Array.from({ length: 12 }, (_, i) => ({ name: `S${i}` }))).length, 3);
});

test("studioNames: networks and companies capped apart — many networks never crowd out the studio", () => {
  const list = (prefix: string) => Array.from({ length: 4 }, (_, i) => ({ name: `${prefix}${i}` }));
  assert.deepEqual(studioNames(list("N"), list("C")), ["N0", "N1", "C0", "C1", "C2"]);
});

test("facetIndexEntry: prefixed genre / country / studio codes + the first 8 keywords", () => {
  const kws = Array.from({ length: 12 }, (_, i) => `kw${i}`);
  const e = facetIndexEntry({ genres: ["Drama"], countries: ["KR"], studios: ["tvN"], keywords: kws });
  assert.deepEqual(e.slice(0, 3), ["g:Drama", "c:KR", "s:tvN"]);
  assert.equal(e.filter((c) => c.startsWith("k:")).length, 8);
  assert.deepEqual(facetIndexEntry(null), []);
});
