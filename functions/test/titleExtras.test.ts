import { test } from "node:test";
import assert from "node:assert/strict";
import {
  featuredCast,
  localReleaseDate,
  normalizeCast,
  normalizeDirectors,
  normalizeStudios,
  normalizeWriters,
  searchCast,
} from "../src/hooks/titleExtras/normalize";
import { extrasFromBundle, missingExtras } from "../src/hooks/titleExtras/resolve";
import { MediaType, MOVIE_LEADS } from "../src/shared/enums";

const actor = (id: number, order: number, extra: object = {}) => ({
  id,
  name: `P${id}`,
  profile_path: null,
  order,
  ...extra,
});

test("movie cast: billing order; leads featured", () => {
  const full = normalizeCast(
    Array.from({ length: 10 }, (_, i) => actor(i, 9 - i, { character: `C${i}` })),
    MediaType.MOVIE,
  );
  assert.equal(full[0].id, 9);
  assert.equal(featuredCast(full, MediaType.MOVIE, undefined).length, MOVIE_LEADS);
});

test("show cast: most episodes first; regulars featured, guests not", () => {
  const full = normalizeCast(
    [
      actor(1, 0, { total_episode_count: 50, roles: [{ character: "Lead", episode_count: 50 }] }),
      actor(2, 1, { total_episode_count: 2, roles: [{ character: "Guest", episode_count: 2 }] }),
      actor(3, 2, { total_episode_count: 30, roles: [{ character: "Main", episode_count: 30 }] }),
    ],
    MediaType.TV,
  );
  assert.deepEqual(full.map((m) => m.id), [1, 3, 2]);
  assert.equal(full[0].episodes, 50);
  assert.deepEqual(featuredCast(full, MediaType.TV, 60).map((m) => m.id), [1, 3]);
});

test("directors once; studios with logos only, networks first", () => {
  assert.deepEqual(
    normalizeDirectors([
      { id: 1, name: "PJ", job: "Director", profile_path: "/pj.jpg" },
      { id: 1, name: "PJ", job: "Director", profile_path: "/pj.jpg" },
      { id: 2, name: "FW", job: "Screenplay", profile_path: null },
    ]),
    [{ id: 1, name: "PJ", profile: "/pj.jpg" }],
  );
  assert.deepEqual(
    normalizeStudios(
      [{ id: 49, name: "HBO", logo_path: "/hbo.png" }],
      [
        { id: 1, name: "No Logo Co", logo_path: null },
        { id: 49, name: "HBO", logo_path: "/hbo.png" },
        { id: 2, name: "Studio", logo_path: "/s.png" },
      ],
    ).map((s) => s.name),
    ["HBO", "Studio"],
  );
});

test("missingExtras / extrasFromBundle", () => {
  assert.deepEqual(missingExtras({}, MediaType.MOVIE, "DE"), {
    credits: true,
    studios: true,
    providers: true,
    release: true,
  });
  const out = extrasFromBundle(
    {
      production_companies: [{ id: 2, name: "S", logo_path: "/s.png" }],
      credits: { cast: [actor(1, 0, { character: "X" })], crew: [] },
      "watch/providers": { results: {} },
      release_dates: { results: [] },
    },
    MediaType.MOVIE,
    "DE",
  );
  assert.equal(out.fields.castTotal, 1);
  assert.deepEqual(out.fields.watchProviders?.DE?.providers, []);
  assert.deepEqual(
    missingExtras(out.fields, MediaType.MOVIE, "DE"),
    { credits: false, studios: false, providers: false, release: false },
  );
});

test("local release: theatrical first, earliest of that type; none is stored as null", () => {
  const results = [
    {
      iso_3166_1: "IN",
      release_dates: [
        { release_date: "2025-05-01T00:00:00.000Z", type: 1 },
        { release_date: "2025-09-01T00:00:00.000Z", type: 4 },
        { release_date: "2025-07-24T00:00:00.000Z", type: 3 },
        { release_date: "2025-07-20T00:00:00.000Z", type: 3 },
      ],
    },
    { iso_3166_1: "DE", release_dates: [{ release_date: "2025-05-01T00:00:00.000Z", type: 1 }] },
  ];
  assert.equal(localReleaseDate(results, "IN"), "2025-07-20");
  assert.equal(localReleaseDate(results, "DE"), null);
  assert.equal(localReleaseDate(results, "FR"), null);
});

test("shows never need a local release; a country's null still counts as stored", () => {
  assert.equal(missingExtras({}, MediaType.TV, "DE").release, false);
  assert.equal(missingExtras({ localReleases: { DE: null } }, MediaType.MOVIE, "DE").release, false);
  assert.equal(missingExtras({ localReleases: { DE: null } }, MediaType.MOVIE, "IN").release, true);
});

test("a movie's writers (Writing department), each once", () => {
  assert.deepEqual(
    normalizeWriters([
      { id: 1, name: "FW", department: "Writing", job: "Screenplay", profile_path: "/fw.jpg" },
      { id: 2, name: "PJ", department: "Directing", job: "Director", profile_path: null },
      { id: 3, name: "JRRT", department: "Writing", job: "Novel", profile_path: null },
      { id: 1, name: "FW", department: "Writing", job: "Story", profile_path: "/fw.jpg" },
    ]).map((w) => w.name),
    ["FW", "JRRT"],
  );
});

test("a catalog doc's studio names (the Studio filter's) don't count as the logos", () => {
  const catalog = { studios: ["HBO", "Paramount"] } as unknown as Parameters<typeof missingExtras>[0];
  assert.equal(missingExtras(catalog, MediaType.TV, "DE").studios, true);
  const out = extrasFromBundle(
    { networks: [{ id: 49, name: "HBO", logo_path: "/hbo.png" }] },
    MediaType.TV,
    null,
  );
  assert.equal("studios" in out.fields, false);
  assert.deepEqual(out.fields.studioLogos?.map((s) => s.name), ["HBO"]);
});

test("cast search: name or character, case / accent-insensitive", () => {
  const cast = [
    { id: 1, name: "Zoë Kravitz", character: "Catwoman", profile: null },
    { id: 2, name: "Robert Pattinson", character: "Batman", profile: null },
    { id: 3, name: "Paul Dano", character: null, profile: null },
  ];
  assert.deepEqual(searchCast(cast, "zoe").map((m) => m.id), [1]);
  assert.deepEqual(searchCast(cast, "BAT").map((m) => m.id), [2]);
  assert.deepEqual(searchCast(cast, "  ").length, 3);
  assert.deepEqual(searchCast(cast, "nobody"), []);
});
